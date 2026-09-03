/**
 * 註冊 / 登入 / 忘記密碼 —— 驗收測試
 *
 * 這三條路徑先前完全沒有自動化覆蓋，而註冊的邀請碼是付費前的門檻，
 * 忘記密碼則是繞過登入守門的常見缺口。
 *
 * 紀律：只驗「頁面結構」與「失敗路徑」，不建立任何帳號、不發送簡訊。
 * register server action 的驗證順序是
 *   email 格式 → email 已註冊 → 手機是否已驗證 → 手機已註冊 → 邀請碼 → 建帳號
 * 因此未通過簡訊驗證的請求會在第三關就被擋下，不會產生副作用。
 */
import { test, expect } from '@playwright/test'

test.describe('註冊頁', () => {
  test('四步驟流程與必要欄位都在', async ({ page }) => {
    await page.goto('/register')

    await expect(page.getByText('輸入手機號碼')).toBeVisible()
    await expect(page.locator('input[type="tel"]')).toBeVisible()
    // 邀請碼是付費前的門檻，欄位必須存在
    await expect(page.getByPlaceholder(/邀請碼/)).toBeVisible()
    // 條款同意
    await expect(page.locator('input[type="checkbox"]')).toBeVisible()
  })

  test('未勾選條款時無法送出', async ({ page }) => {
    await page.goto('/register')

    const submit = page.getByRole('button', { name: /驗證並繼續/ })
    await expect(submit).toBeVisible()

    // 直接送出（未填手機、未驗證、未勾條款）不應離開註冊頁
    await submit.click().catch(() => {})
    await page.waitForTimeout(1500)
    expect(page.url()).toContain('/register')
  })

  test('已登入者不需要再註冊 —— 頁面提供前往登入的入口', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('link', { name: /前往登入/ })).toBeVisible()
  })
})

test.describe('忘記密碼', () => {
  test('頁面載入且要求手機驗證', async ({ page }) => {
    const res = await page.goto('/forgot-password')
    expect(res?.status()).toBeLessThan(400)

    await expect(page.locator('input[type="tel"]')).toBeVisible()
    // 必須先過簡訊驗證才能重設 —— 驗證碼欄位要在
    await expect(page.locator('input[inputmode="numeric"]')).toBeVisible()
  })
})

test.describe('登入後導向（next 參數）', () => {
  test('帶 next 的登入頁正常載入、表單仍在', async ({ page }) => {
    await page.goto('/login?next=%2Fapi%2Fapps%2Fhappy%2Flaunch%3Fto%3Dapp')

    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page).toHaveURL(/next=/)
  })

  test('SSO launch 未登入時會把 next 帶進登入頁', async ({ request }) => {
    // 這是 next 參數存在的理由：登入後要能自動回到 App
    const res = await request.get('/api/apps/happy/launch?to=app', { maxRedirects: 0 })
    const location = res.headers()['location'] ?? ''

    expect(location).toContain('/login')
    expect(decodeURIComponent(location), 'next 應指向 launch 路徑').toContain('/api/apps/happy/launch')
  })

  test('外部網址不會被當成登入後導向目標', async ({ page }) => {
    // 白名單邏輯由 safe-next.spec.ts 覆蓋；這裡確認頁面本身不會因為惡意參數而異常
    await page.goto('/login?next=https%3A%2F%2Fevil.example')

    await expect(page.locator('input[type="password"]')).toBeVisible()
    expect(page.url()).toContain('/login')
  })
})
