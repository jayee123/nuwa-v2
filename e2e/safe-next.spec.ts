/**
 * safeNext —— 登入後導向的白名單驗證（純函式，不需瀏覽器）
 *
 * 這層防的是開放轉址（open redirect）：?next= 來自網址參數，
 * 直接 redirect 會讓攻擊者做出「在我們的網域登入、卻被送到外部站台」的釣魚連結。
 *
 * 公版目前沒有獨立的單元測試 runner，為避免多引入一個相依套件，
 * 借用 Playwright 執行（純 Node，不開瀏覽器）。
 */
import { test, expect } from '@playwright/test'
import { safeNext, DEFAULT_AFTER_LOGIN } from '../src/lib/safe-next'

test.describe('safeNext：允許的站內路徑', () => {
  test('一般站內路徑原樣放行', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard')
    expect(safeNext('/dashboard/subscribe')).toBe('/dashboard/subscribe')
  })

  test('SSO 進入 App 的路徑（含 query）放行', () => {
    // 這是這個功能存在的主要理由：launch route 會帶這個 next
    expect(safeNext('/api/apps/happy/launch?to=app')).toBe('/api/apps/happy/launch?to=app')
  })
})

test.describe('safeNext：擋下的外部轉址', () => {
  test('完整外部網址', () => {
    expect(safeNext('https://evil.example')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('http://evil.example/path')).toBe(DEFAULT_AFTER_LOGIN)
  })

  test('協定相對網址（//host）—— 瀏覽器會當成外部網域', () => {
    expect(safeNext('//evil.example')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('//evil.example/path')).toBe(DEFAULT_AFTER_LOGIN)
  })

  test('反斜線變形（/\\host）—— 部分瀏覽器等同 //', () => {
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_AFTER_LOGIN)
  })

  test('相對路徑（無前導斜線）—— 行為依當前頁而定，不可預期', () => {
    expect(safeNext('dashboard')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('../admin')).toBe(DEFAULT_AFTER_LOGIN)
  })

  test('其他協定', () => {
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('data:text/html,<script>')).toBe(DEFAULT_AFTER_LOGIN)
  })
})

test.describe('safeNext：空值', () => {
  test('未提供時回預設頁', () => {
    expect(safeNext(null)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(undefined)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('')).toBe(DEFAULT_AFTER_LOGIN)
  })
})
