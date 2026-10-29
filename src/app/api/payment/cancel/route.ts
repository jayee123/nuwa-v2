import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelPendingPayment } from '@/lib/sunpay/cancel'

// POST /api/payment/cancel { paymentId }
// 結帳頁「取消付款」：把自己那筆待付款標成已取消（規則見 lib/sunpay/cancel.ts）。
// 回 { status, paymentUid }：通知比按鈕先到時 status 可能已是 paid，前端照著跳成功頁。
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: { paymentId?: unknown }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const paymentId = typeof input.paymentId === 'string' ? input.paymentId : ''
  if (!paymentId) return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 })

  const result = await cancelPendingPayment(createAdminClient(), user.id, paymentId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  return NextResponse.json({ status: result.status, paymentUid: result.paymentUid })
}
