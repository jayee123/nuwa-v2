import { createAdminClient } from '@/lib/supabase/admin'
import { getSunpayConfig } from '@/lib/sunpay/config'
import { parseNotify, verifyNotify, type ParsedNotify } from '@/lib/sunpay/crypto'
import { decideNotify, settleNotify, type PendingPayment } from '@/lib/sunpay/settle'

// 紅陽 SunPay v3「交易結果通知網址」（後台：系統設定／開發者專區／特店 URL 設定）。
// 紅陽伺服器背景 POST { web, send_time, rsamsg, check_value }，首次付款與月扣共用。
// 處理完要回純文字 "success"（不可含 HTML），否則紅陽 30 分鐘內每 5 分鐘補發。
//
// 回應規則：
//   success → 已處理或不需處理（重複通知、不是我們的新版訂單）
//   400     → 內容有問題、先不動帳（解不開、不是我們的特店、check_value 不符、金額不符），紅陽會補發
//   500     → 我們這邊暫時出錯（設定缺漏、DB 失敗），紅陽補發時重來

const SUCCESS = 'success'

function plain(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

async function readPayload(request: Request): Promise<{ rsamsg: string; check_value: string }> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await request.json()) as Record<string, unknown>
    return { rsamsg: String(json.rsamsg ?? ''), check_value: String(json.check_value ?? '') }
  }
  const form = await request.formData()
  return { rsamsg: String(form.get('rsamsg') ?? ''), check_value: String(form.get('check_value') ?? '') }
}

export async function POST(request: Request) {
  const configResult = await getSunpayConfig()
  if (!configResult.ok) {
    console.error('[sunpay/notify] 金流設定不完整', configResult.problems)
    return plain('FAIL', 500)
  }
  const config = configResult.config

  let payload: { rsamsg: string; check_value: string }
  try {
    payload = await readPayload(request)
  } catch {
    return plain('FAIL', 400)
  }
  if (!payload.rsamsg) {
    console.error('[sunpay/notify] 缺少 rsamsg')
    return plain('FAIL', 400)
  }

  let parsed: ParsedNotify
  try {
    parsed = parseNotify(config, payload)
  } catch (err) {
    // 公鑰解不開＝不是紅陽私鑰產的（或資料壞掉），一律不處理
    console.error('[sunpay/notify] rsamsg 解不開', err instanceof Error ? err.message : err)
    return plain('FAIL', 400)
  }
  const verified = verifyNotify(parsed)
  if (!verified.ok) {
    // 特店不符或 check_value 不符：不動帳。真的是紅陽的通知時，紅陽會補發，log 留著可人工查
    console.error('[sunpay/notify] 驗證不通過', { reason: verified.reason, td: parsed.body.td })
    return plain('FAIL', 400)
  }

  const body = parsed.body
  const admin = createAdminClient()
  const { data: payment, error: lookupError } = body.td
    ? await admin
        .from('payments')
        .select('id, user_id, service_id, amount, plan_name, status, payment_uid')
        .eq('payment_uid', body.td)
        .maybeSingle()
    : { data: null, error: null }
  if (lookupError) {
    // 查不到 ≠ 不存在：DB 暫時出錯時回 success 會讓紅陽停止補發，錢收了卻永遠開不了通
    console.error('[sunpay/notify] 查付款失敗，等紅陽補發', { td: body.td, error: lookupError.message })
    return plain('FAIL', 500)
  }

  const decision = decideNotify(payment as PendingPayment | null, body)
  if (decision.action === 'reject') {
    console.error('[sunpay/notify] 拒絕', { td: body.td, reason: decision.reason })
    return plain('FAIL', 400)
  }
  if (decision.action === 'ignore') {
    console.warn('[sunpay/notify] 不需處理', { td: body.td, reason: decision.reason })
    return plain(SUCCESS)
  }

  try {
    const outcome = await settleNotify(admin, payment as PendingPayment, body, decision, config.tokenKey)
    const log = outcome === 'paid_needs_review' ? console.error : console.log
    log('[sunpay/notify] 入帳完成', { td: body.td, outcome, kind: decision.kind })
    return plain(SUCCESS)
  } catch (err) {
    console.error('[sunpay/notify] 入帳失敗，等紅陽補發', { td: body.td, error: err instanceof Error ? err.message : err })
    return plain('FAIL', 500)
  }
}
