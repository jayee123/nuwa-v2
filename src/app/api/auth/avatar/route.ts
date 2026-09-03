import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '僅支援圖片格式' }, { status: 400 })
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: '檔案大小不能超過 2MB' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const filePath = `${user.id}.${ext}`

  // Convert File to Buffer for server-side upload
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload to Supabase Storage (overwrite existing)
  const { error: uploadError } = await admin.storage
    .from('avatars')
    .upload(filePath, buffer, {
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) {
    return NextResponse.json({ error: '上傳失敗：' + uploadError.message }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = admin.storage
    .from('avatars')
    .getPublicUrl(filePath)

  const avatarUrl = urlData.publicUrl

  // Update users table
  const { error: updateError } = await admin
    .from('users')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id)

  if (updateError) {
    return NextResponse.json({ error: '更新失敗：' + updateError.message }, { status: 500 })
  }

  return NextResponse.json({ avatarUrl })
}
