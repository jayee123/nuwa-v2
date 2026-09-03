import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ role: null })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ role: data?.role ?? 'user' })
}
