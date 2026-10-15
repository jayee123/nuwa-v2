import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

export const metadata: Metadata = { title: '付款完成 — 羽升幸福養成學苑' }

// 紅陽付款視窗付完後落在這裡（經 /api/payment/sunpay/return 轉導）。
// 結果以紅陽背景通知為準，原本的結帳頁會自動跳轉，所以這頁只做說明。
export default function PaymentReturnPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <CheckCircle className="mx-auto size-12 text-brand-teal" />
        <h1 className="mt-4 font-heading text-xl font-bold text-fg-primary">已送出付款</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          原本的結帳頁會在確認付款後自動跳轉，這個視窗可以關閉。
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-brand-purple hover:underline">
          回到訂閱管理
        </Link>
      </div>
    </div>
  )
}
