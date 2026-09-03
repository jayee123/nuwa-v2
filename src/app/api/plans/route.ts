import { NextResponse } from 'next/server'
import { getActivePlans } from '@/lib/queries/plans'

// 公開：列出啟用中的統一方案（結帳頁用 code 找價格）
export async function GET() {
  const plans = await getActivePlans()
  return NextResponse.json({ data: plans })
}
