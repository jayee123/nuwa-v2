/**
 * src/lib/safe-next.ts
 *
 * 登入後要導向哪裡 —— 對 ?next= 參數做白名單驗證。
 *
 * ⚠️ 資安：next 來自網址參數，直接拿去 redirect 就是開放轉址（open redirect）漏洞。
 *   攻擊者可以做出 https://next.nuwa.chg2asc.com/login?next=https://evil.example
 *   的釣魚連結 —— 使用者看到的是我們的網域、也真的在我們這裡登入，
 *   登入成功後卻被送到外部站台，很容易接著被騙走其他資訊。
 *
 * 因此只接受「站內絕對路徑」：
 *   ✓ /dashboard
 *   ✓ /api/apps/happy/launch?to=app     ← SSO 進入 App 的實際用途
 *   ✗ https://evil.example              不是 / 開頭
 *   ✗ //evil.example                    協定相對網址，瀏覽器會當成外部網域
 *   ✗ /\evil.example                    部分瀏覽器等同 //
 *   ✗ dashboard                         相對路徑，行為依當前頁而定，不可預期
 */

export const DEFAULT_AFTER_LOGIN = '/dashboard'

export function safeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_LOGIN
  if (!next.startsWith('/')) return DEFAULT_AFTER_LOGIN
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_AFTER_LOGIN
  return next
}
