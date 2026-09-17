import { NextResponse } from 'next/server'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'
import { recordGatewayTx } from '@/lib/esafe/ledger'

// 標記退款（金流帳務 A 案）
// POST /api/manage/finance/refund  body: { payment_id, note? }
//
// ⚠️ 這支 API **不會**向紅陽發起退款 —— 錢的移動 100% 由管理者先在
//    紅陽商家後台人工執行，這裡只是讓系統的帳跟上事實：
//    寫一筆負向 refund 帳、payments 轉 refunded、audit log 記操作者。

export async function POST(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let paymentId = ''
  let note: string | null = null
  try {
    const body = (await request.json()) as { payment_id?: unknown; note?: unknown }
    if (typeof body.payment_id === 'string') paymentId = body.payment_id
    if (typeof body.note === 'string' && body.note.trim()) note = body.note.trim().slice(0, 500)
  } catch {
    // 落到下面的空值檢查
  }
  if (!paymentId) return NextResponse.json({ error: '缺少 payment_id' }, { status: 400 })

  const { data: payment } = await ctx.admin
    .from('payments')
    .select('id, user_id, amount, status, payment_uid, plan_name')
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) return NextResponse.json({ error: '找不到這筆付款' }, { status: 404 })
  if (payment.status === 'refunded') {
    return NextResponse.json({ error: '這筆已經標記過退款' }, { status: 409 })
  }
  if (payment.status !== 'paid') {
    return NextResponse.json({ error: `只有「已付款」可標記退款（此筆為 ${payment.status}）` }, { status: 400 })
  }

  // 順序：先轉狀態再記帳 —— 兩個都是冪等安全的方向
  //（狀態先轉，重複請求會被上面的 409 擋；帳若沒寫成功，log 會留 error 可人工補）
  const { error: updError } = await ctx.admin
    .from('payments')
    .update({ status: 'refunded' })
    .eq('id', payment.id)
    .eq('status', 'paid') // 併發雙擊防護：只有仍是 paid 的那次會成功
  if (updError) {
    return NextResponse.json({ error: '更新付款狀態失敗：' + updError.message }, { status: 500 })
  }

  await recordGatewayTx(ctx.admin, {
    userId: payment.user_id,
    paymentId: payment.id,
    txType: 'refund',
    amount: -Math.abs(payment.amount),
    orderNo: payment.payment_uid,
    success: true,
    note,
    createdBy: ctx.userId,
  })

  await logAudit(ctx.admin, ctx.userId, 'payment.mark_refunded', payment.id, {
    amount: payment.amount,
    order_no: payment.payment_uid,
    note,
  })

  return NextResponse.json({ data: { refunded: true } })
}
