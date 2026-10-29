import { getSecretParam } from '@/lib/secret-params'

/**
 * src/lib/email.ts
 *
 * 對外寄信的共用設定。
 *
 * ⚠️ 寄件網域必須是【已在 Resend 驗證過】的網域，否則整封信會被拒收。
 *
 * Resend 驗證的是根網域 chg2asc.com，因此可以直接寄自 @chg2asc.com。
 *
 * 這【不會】影響公司的 Google Workspace：Resend 的退信與 SPF 放在
 * send.chg2asc.com 子網域，根網域的 @ SPF、MX 完全不動。
 * 實測（2026-08-21）根網域 SPF 仍是 include:_spf.google.com、
 * MX 仍是 aspmx.l.google.com。
 *
 * 對應的 DNS（GoDaddy，Resend Auto configure 產生）：
 *   MX  send.chg2asc.com               feedback-smtp.ap-northeast-1.amazonses.com
 *   TXT send.chg2asc.com               SPF（經 GoDaddy _spfm 轉址到 amazonses.com）
 *   TXT resend._domainkey.chg2asc.com  DKIM 公鑰
 *
 * 要換網域時只改這裡一處 —— 先前這個字串在四支路由各寫一次，
 * 改的時候漏掉任何一處，那條路徑的信就會安靜地寄不出去。
 */

/** 寄件人（顯示名稱 + 已驗證網域的地址） */
export const MAIL_FROM = '羽升幸福養成學苑 <noreply@chg2asc.com>'

/** Resend API endpoint */
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * 寄一封信。沒設定 RESEND_API_KEY、連不上或 Resend 回錯誤就 throw，
 * 由呼叫端決定要不要擋流程（例如管理員 Email 驗證碼寄不出去就要讓使用者知道）。
 */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = (await getSecretParam('RESEND_API_KEY')).trim()
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY 未設定（後台 系統設定 → Email & 簡訊），信不寄')
    throw new Error('Email 服務尚未設定，請聯絡客服。')
  }
  let response: Response
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
    })
  } catch (e) {
    console.error('[email] Resend 連線失敗:', e instanceof Error ? e.message : e)
    throw new Error('Email 寄送失敗，請稍後再試。')
  }
  if (!response.ok) {
    console.error('[email] Resend 回錯誤:', response.status, (await response.text()).slice(0, 300))
    throw new Error('Email 寄送失敗，請稍後再試。')
  }
}
