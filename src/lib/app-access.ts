import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole, isSuperAdmin } from '@/lib/roles'

// Market 後台的 per-App 管理權限工具。
// superadmin：可管全部 App；一般 admin：只能管 app_admins 有列到的 App。

export interface AdminCtx {
  userId: string
  role: string | null
  isSuper: boolean
  admin: ReturnType<typeof createAdminClient>
}

// 取得登入的後台管理者上下文（非登入 / 非 admin → null）
export async function getAdminCtx(): Promise<AdminCtx | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return null
  return { userId: user.id, role: u?.role ?? null, isSuper: isSuperAdmin(u?.role), admin }
}

// 這個管理者能管的 app_id 清單；superadmin 回 null（代表「全部」）
export async function getAccessibleAppIds(ctx: AdminCtx): Promise<string[] | null> {
  if (ctx.isSuper) return null
  const { data } = await ctx.admin.from('app_admins').select('app_id').eq('user_id', ctx.userId)
  return (data ?? []).map((r) => r.app_id as string)
}

// 後台讀取頁用：一次取得 admin client + 可管的 app_id 過濾條件。
// appIds = null 代表 superadmin（不過濾，看全部）；[] 代表沒被指派任何 App（看不到 App 資料）。
// 非登入 / 非 admin → null（頁面應擋掉，通常 layout 已先 guard）。
export async function getAppScope(): Promise<{ admin: AdminCtx['admin']; appIds: string[] | null } | null> {
  const ctx = await getAdminCtx()
  if (!ctx) return null
  const appIds = await getAccessibleAppIds(ctx)
  return { admin: ctx.admin, appIds }
}

// 判斷這個管理者能否管某支 App
export async function canManageApp(ctx: AdminCtx, appId: string): Promise<boolean> {
  if (ctx.isSuper) return true
  const { data } = await ctx.admin
    .from('app_admins')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('app_id', appId)
    .maybeSingle()
  return !!data
}
