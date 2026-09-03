import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Verify setup secret
  const { secret } = await request.json()
  const setupSecret = process.env.SETUP_SECRET
  if (!setupSecret || secret !== setupSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const phone = process.env.SUPERADMIN_PHONE
  const password = process.env.SUPERADMIN_PASSWORD
  if (!phone || !password) {
    return NextResponse.json(
      { error: 'Missing SUPERADMIN_PHONE or SUPERADMIN_PASSWORD env vars' },
      { status: 500 }
    )
  }

  const admin = createAdminClient()

  // Step 1: Check if user already exists in users table
  // Phone may be stored with or without '+' prefix
  const phoneWithout = phone.replace(/^\+/, '')
  const { data: existing } = await admin
    .from('users')
    .select('id, role')
    .or(`phone.eq.${phone},phone.eq.${phoneWithout}`)
    .limit(1)
    .single()

  if (existing) {
    if (existing.role !== 'superadmin') {
      await admin.from('users').update({ role: 'superadmin' }).eq('id', existing.id)
      // Also update password in auth
      await admin.auth.admin.updateUserById(existing.id, { password })
      return NextResponse.json({ message: 'Existing user promoted to superadmin' })
    }
    return NextResponse.json({ message: 'Superadmin already exists' })
  }

  // Step 2: Not in users table — check if phone exists in Supabase Auth
  // Try to create; if it fails, the auth user already exists
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  })

  let userId: string

  if (authError) {
    // Auth user exists but not in users table — find their ID
    // listUsers with filter
    // Supabase Auth stores phone without '+' prefix
    const phoneNormalized = phone.replace(/^\+/, '')
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const found = listData?.users?.find((u: { phone?: string }) => u.phone === phone || u.phone === phoneNormalized)
    if (!found) {
      return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 500 })
    }
    userId = found.id
    // Update password
    await admin.auth.admin.updateUserById(userId, { password })
  } else {
    userId = authUser.user.id
  }

  // Step 3: Insert into users table
  const { error: insertError } = await admin.from('users').insert({
    id: userId,
    phone,
    nickname: 'Admin',
    role: 'superadmin',
    current_plan: 'free',
    dialog_limit: 9999,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'Superadmin created successfully' })
}
