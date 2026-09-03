import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/payment/status?paymentId=xxx
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paymentId = request.nextUrl.searchParams.get('paymentId')
  if (!paymentId) return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: payment } = await admin
    .from('payments')
    .select('status, payment_uid')
    .eq('id', paymentId)
    .eq('user_id', user.id)
    .single()

  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    status: payment.status,
    paymentUid: payment.payment_uid,
  })
}
