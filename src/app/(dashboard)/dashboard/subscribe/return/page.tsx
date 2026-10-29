import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock } from 'lucide-react'

export const metadata: Metadata = { title: '付款結果確認中 — 羽升幸福養成學苑' }

// 紅陽付款視窗付完後落在這裡（經 /api/payment/sunpay/return 轉導）。
// 付款成功或失敗都會被導來（10/17 實測：刷卡失敗也先到這頁，5 秒後才收到失敗通知），
// 這裡不知道結果，文案要中性：結果以紅陽背景通知為準，原本的結帳頁會自己更新。
export default function PaymentReturnPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <Clock className="mx-auto size-12 text-fg-muted" />
        <h1 className="mt-4 font-heading text-xl font-bold text-fg-primary">付款視窗已完成</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          結果確認中，原本的頁面會自動更新。這個視窗可以關閉。
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-brand-purple hover:underline">
          回到訂閱管理
        </Link>
      </div>
    </div>
  )
}
