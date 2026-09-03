import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  // Check admin
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const serviceId = formData.get('serviceId') as string | null

  if (!file) return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })
  if (!serviceId) return NextResponse.json({ error: '缺少 serviceId' }, { status: 400 })

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '僅支援圖片格式' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: '檔案大小不能超過 5MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const filePath = `banners/${serviceId}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await admin.storage
    .from('avatars')
    .upload(filePath, buffer, {
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) {
    return NextResponse.json({ error: '上傳失敗：' + uploadError.message }, { status: 500 })
  }

  const { data: urlData } = admin.storage
    .from('avatars')
    .getPublicUrl(filePath)

  const bannerUrl = urlData.publicUrl

  const { error: updateError } = await admin
    .from('services')
    .update({ banner_url: bannerUrl })
    .eq('id', serviceId)

  if (updateError) {
    return NextResponse.json({ error: '更新失敗：' + updateError.message }, { status: 500 })
  }

  return NextResponse.json({ bannerUrl })
}
