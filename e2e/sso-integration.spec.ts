/**
 * 公版 → 私版 SSO 端到端 — 驗收測試
 *
 * 這條路徑跨兩個 repo：公版 /api/apps/:slug/launch 簽 token，
 * 私版 /sso 驗 token 並建立自己的 session。任一邊改動都可能悄悄弄壞它，
 * 而在此之前兩邊都沒有測試覆蓋。
 *
 * 需要公版 session 的測試會讀 SESSION_COOKIES —— 一個含公版登入 cookie 的 JSON。
 * 最簡單的產生方式是 Playwright 內建的 codegen：
 *
 *   npx playwright codegen --save-storage=auth.json http://localhost:3000/login
 *   （手動登入一次後關掉視窗）
 *   SESSION_COOKIES=auth.json npx playwright test -c playwright.e2e.config.ts e2e/sso-integration.spec.ts
 *
 * 檔案格式接受 Playwright 的 storageState（{ cookies: [...] }）或單純的 cookie 陣列。
 * 沒設 SESSION_COOKIES 時，只跑不需登入的負向測試，其餘自動 skip。
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'

const SESSION_COOKIES = process.env.SESSION_COOKIES
const APP_SLUG = 'happy'

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

/** 接受 Playwright storageState（{ cookies: [...] }）或單純的 cookie 陣列 */
function loadCookies(path: string) {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8'))
  return Array.isArray(parsed) ? parsed : parsed.cookies
}

test.describe('SSO 簽發（公版）', () => {
  test('未登入時導向登入頁、不簽發 token', async ({ request }) => {
    const res = await request.get(`/api/apps/${APP_SLUG}/launch`, { maxRedirects: 0 })

    expect(res.status(), '應為 3xx 轉址').toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)

    const location = res.headers()['location'] ?? ''
    expect(location, '未登入不該拿到 token').not.toContain('token=')
    expect(location).toContain('/login')
  })

  test('未知的 App slug 不簽發 token', async ({ request }) => {
    const res = await request.get('/api/apps/does-not-exist/launch', { maxRedirects: 0 })
    const location = res.headers()['location'] ?? ''
    expect(location).not.toContain('token=')
  })

  test('已登入時簽出結構正確的短效 token', async ({ context }) => {
    test.skip(!SESSION_COOKIES, '需要 SESSION_COOKIES（見檔頭說明）')

    await context.addCookies(loadCookies(SESSION_COOKIES!))
    // 用 context.request（與瀏覽器 context 共用 cookie），不是獨立的 request fixture
    const res = await context.request.get(`/api/apps/${APP_SLUG}/launch`, { maxRedirects: 0 })

    const location = res.headers()['location'] ?? ''
    expect(location, '應導向私版的 /sso').toContain('/sso?token=')

    const token = new URL(location).searchParams.get('token')!
    expect(token.split('.'), 'HS256 JWT 應有三段').toHaveLength(3)

    const payload = decodeJwtPayload(token)
    expect(payload.app, 'app 應為此 slug').toBe(APP_SLUG)
    expect(payload.sub, 'sub 應為 nuwa_user_id').toEqual(expect.any(String))

    const ttl = (payload.exp as number) - (payload.iat as number)
    expect(ttl, 'token 應為短效（<= 5 分鐘）').toBeLessThanOrEqual(300)
    expect(payload.exp as number, 'token 不該已過期').toBeGreaterThan(Math.floor(Date.now() / 1000))
  })
})

test.describe('SSO 接收（私版）', () => {
  test('私版拒絕偽造 token', async ({ page, context }) => {
    test.skip(!SESSION_COOKIES, '需要 SESSION_COOKIES 才能取得 app_url')

    // 先問公版該 App 的實際網址，避免把私版網域寫死在測試裡
    await context.addCookies(loadCookies(SESSION_COOKIES!))
    const res = await context.request.get(`/api/apps/${APP_SLUG}/launch`, { maxRedirects: 0 })
    const appOrigin = new URL(res.headers()['location'] ?? '').origin
    await page.goto(`${appOrigin}/sso?token=forged.token.value`)

    expect(page.url(), '偽造 token 應被導回私版登入頁').toContain('/auth/login')
    expect(page.url()).toContain('error=sso_')
  })

  test('完整交握：公版 launch → 私版建立 session', async ({ page, context }) => {
    test.skip(!SESSION_COOKIES, '需要 SESSION_COOKIES（見檔頭說明）')

    await context.addCookies(loadCookies(SESSION_COOKIES!))
    const res = await context.request.get(`/api/apps/${APP_SLUG}/launch`, { maxRedirects: 0 })
    const ssoUrl = res.headers()['location']!

    await page.goto(ssoUrl)
    await page.waitForLoadState('domcontentloaded')

    expect(page.url(), 'SSO 失敗會落在私版登入頁').not.toContain('/auth/login')

    const cookies = await context.cookies()
    const session = cookies.find((c) => c.name === 'happy_session')
    expect(session, '私版應發出 happy_session cookie').toBeTruthy()
    expect(session!.httpOnly, 'session cookie 應為 httpOnly').toBe(true)
  })
})
