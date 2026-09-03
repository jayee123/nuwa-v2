import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'
import { PLAN_LEVEL, meetsRequiredPlan } from '@/lib/plans'

// Market → App SSO 簽發（token handoff）
// GET /api/apps/:slug/launch
//   1. 驗 Market session（未登入→/login）
//   2. 查 App(active) + 進入門檻(required_plan)
//   3. upsert user_apps 綁定
//   4. 用 App 的 sso_secret 簽短效 JWT(sub=nuwa_user_id, email, name, app, exp+120s)
//   5. 302 導向 {app_url}/sso?token=...
//   App 端收到後：驗 token → 建/連自己 schema 的 user(nuwa_user_id) → 發自己 session

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // to=welcome → 私版先看導覽；to=app → 直接進 App；to=admin → 進 App 的課程後台；
  // 未帶 → 私版自行判斷
  const to = new URL(request.url).searchParams.get('to')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `/api/apps/${slug}/launch${to ? `?to=${to}` : ''}`)
    return NextResponse.redirect(loginUrl)
  }

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('apps')
    .select('id, slug, name, app_url, admin_url, sso_secret, required_plan, status')
    .eq('slug', slug)
    .maybeSingle()

  if (!app || app.status !== 'active') {
    return NextResponse.redirect(new URL('/dashboard/apps?error=app_unavailable', request.url))
  }
  if (!app.app_url || !app.sso_secret) {
    return NextResponse.redirect(new URL('/dashboard/apps?error=app_not_configured', request.url))
  }

  // 進入門檻：required_plan 有值時，要求用戶方案不是 trial/未訂閱
  const { data: u } = await admin
    .from('users')
    .select('current_plan, email, nickname, deleted_at, role')
    .eq('id', user.id)
    .maybeSingle()

  // 020: 軟刪除帳號即使還有有效 session，也不得再 SSO 進 App
  if (u?.deleted_at) {
    return NextResponse.redirect(new URL('/login?error=account_disabled', request.url))
  }

  // to=admin 是「進 App 的課程後台」，屬於營運人員動作，不是會員動作。
  // 因此改用管理者身分驗證，而不是訂閱方案 —— 後台管理者沒有訂閱是正常的。
  // 任何登入者都能自己組出這個網址，所以這道檢查不可省略。
  const isAdminEntry = to === 'admin'
  if (isAdminEntry) {
    if (!isAdminRole(u?.role)) {
      return NextResponse.redirect(new URL('/dashboard?error=not_admin', request.url))
    }
    if (!app.admin_url) {
      return NextResponse.redirect(new URL('/manage/apps?error=admin_url_not_set', request.url))
    }
  } else if (app.required_plan) {
    // 這道門檻原本寫成 `plan !== 'trial' && plan !== 'cancelled'`。
    // 但 'trial' / 'cancelled' 是**私版**的方案值 —— 公版的 current_plan 只有
    // free / basic / advanced / premium（register/actions.ts 建號即為 'free'）。
    // 兩個後果：
    //   1. free 用戶永遠通過 —— 付費 App 對免費用戶等於沒有門檻
    //   2. required_plan 的值本身從未被比較 —— 設 premium 的 App，basic 用戶照進
    // 改為用 lib/plans 的等級表實際比較，並在門檻值不合法時 fail closed。
    if (!(app.required_plan in PLAN_LEVEL)) {
      console.error(
        `[launch] app "${slug}" 的 required_plan="${app.required_plan}" 不是公版的方案代碼，一律擋下`,
      )
    }
    if (!meetsRequiredPlan(u?.current_plan, app.required_plan)) {
      return NextResponse.redirect(new URL(`/dashboard/subscribe?app=${slug}`, request.url))
    }
  }

  // 綁定（Market 端記錄此會員綁了此 App）
  await admin.from('user_apps').upsert(
    { user_id: user.id, app_id: app.id, status: 'active' },
    { onConflict: 'user_id,app_id' },
  )

  const now = Math.floor(Date.now() / 1000)
  const token = signJwt(
    {
      sub: user.id, // nuwa_user_id
      email: u?.email ?? user.email ?? '',
      name: u?.nickname ?? '',
      app: app.slug,
      ...(to ? { to } : {}), // 私版 /sso 依此導向 welcome / app
      iat: now,
      exp: now + 120, // 短效 2 分鐘
    },
    app.sso_secret,
  )

  // 本機整合開發用的逃生門。
  //
  // SSO 的目標網址存在資料庫（apps.app_url），指向正式站的 App。
  // 本機把公版與私版都跑起來時，公版會把人送去正式站而不是 localhost。
  // 若為此去改資料庫的 app_url，正式站的 SSO 會對所有真實用戶壞掉 ——
  // 所以改用環境變數，讓本機各自覆寫、不必動到共用資料。
  //
  // 兩道鎖：production 一律讀資料庫（Vercel 的 production 與 preview 都算
  // production，所以正式站沒有繞過的可能）；沒設變數時落回原值。
  const appUrl =
    process.env.NODE_ENV === 'production'
      ? app.app_url
      : (process.env[`DEV_APP_URL_${slug.toUpperCase()}`] ?? app.app_url)

  if (appUrl !== app.app_url) {
    console.warn(`[launch] 使用本機覆寫網址 ${appUrl}（正式環境不會發生）`)
  }

  // /sso 一律在 App 的根路徑。to=admin 時後台可能架在不同網域，
  // 因此改用 admin_url 的 origin 當基底（落點路徑由私版依 to 決定）。
  const ssoBase = isAdminEntry ? new URL(app.admin_url as string).origin : appUrl
  const target = new URL('/sso', ssoBase)
  target.searchParams.set('token', token)
  return NextResponse.redirect(target)
}
