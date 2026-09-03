'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, CreditCard, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CheckoutPage({
  params: paramsPromise,
}: {
  params: Promise<{ code: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planCode = searchParams.get('plan') ?? ''
  const billing = searchParams.get('billing') ?? 'monthly'
  const [planLabel, setPlanLabel] = useState('')

  const formRef = useRef<HTMLFormElement>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [esafe, setEsafe] = useState<{ url: string; params: Record<string, string | number> } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)

  // Resolve params
  useEffect(() => {
    paramsPromise.then((p) => setCode(p.code))
  }, [paramsPromise])

  // Initiate payment
  useEffect(() => {
    if (!code || !planCode) return

    async function initiate() {
      setLoading(true)
      setError(null)
      try {
        const plansRes = await fetch('/api/plans')
        const plansData = await plansRes.json()
        const plan = (plansData.data ?? []).find((p: { code: string }) => p.code === planCode)
        if (!plan) {
          setError('找不到此方案')
          setLoading(false)
          return
        }
        setPlanLabel(plan.name)

        // 收費 = 每月收費金額；年繳打八折
        const fullPrice = billing === 'yearly' ? Math.round(plan.monthly_charge * 12 * 0.8) : plan.monthly_charge

        const res = await fetch('/api/payment/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planCode, amount: fullPrice, serviceCode: code, billing }),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? '付款初始化失敗')
          setLoading(false)
          return
        }

        const data = await res.json()
        setEsafe(data.esafe)
        setPaymentId(data.paymentId)
        setLoading(false)
      } catch {
        setError('系統錯誤，請重試')
        setLoading(false)
      }
    }

    initiate()
  }, [code, planCode, billing])

  // Auto-submit eSafe form (opens in named popup window)
  useEffect(() => {
    if (esafe && formRef.current && !submitted) {
      setSubmitted(true)
      // Use named target to avoid extra about:blank tab
      formRef.current.target = 'esafe_payment'
      window.open('about:blank', 'esafe_payment')
      formRef.current.submit()
      setPolling(true)
    }
  }, [esafe, submitted])

  // Poll payment status
  const pollPayment = useCallback(async () => {
    if (!paymentId) return
    try {
      const res = await fetch(`/api/payment/status?paymentId=${paymentId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'paid') {
          setPaymentDone(true)
          setPolling(false)
          // Redirect to success page
          router.push(`/dashboard/subscribe/success?td=${data.paymentUid}`)
        }
      }
    } catch { /* ignore */ }
  }, [paymentId, router])

  useEffect(() => {
    if (!polling || !paymentId) return
    const interval = setInterval(pollPayment, 3000) // Poll every 3 seconds
    return () => clearInterval(interval)
  }, [polling, paymentId, pollPayment])

  if (!planCode) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-fg-secondary">未選擇方案</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-brand-purple hover:underline">
            回到訂閱管理
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-destructive">{error}</p>
          <Link href={`/dashboard/subscribe/${code}`}>
            <Button variant="outline" className="mt-4">
              返回方案選擇
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Payment completed
  if (paymentDone) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <CheckCircle className="mx-auto size-12 text-brand-teal" />
          <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">付款成功！</h2>
          <p className="mt-2 text-sm text-fg-secondary">正在跳轉...</p>
        </div>
      </div>
    )
  }

  // Polling state — waiting for payment
  if (polling) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto size-10 animate-spin text-brand-purple" />
          <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">等待付款完成...</h2>
          <p className="mt-2 text-sm text-fg-secondary">
            請在付款頁面完成刷卡，完成後此頁面會自動跳轉
          </p>
          <p className="mt-4 text-xs text-fg-muted">
            如果付款視窗被關閉，
            <button
              onClick={() => formRef.current?.submit()}
              className="text-brand-purple underline"
            >
              點此重新開啟
            </button>
          </p>
          <Link
            href={`/dashboard/subscribe/${code}`}
            className="mt-4 inline-block text-xs text-fg-muted hover:text-fg-secondary"
          >
            取消付款
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        {loading ? (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-brand-purple" />
            <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">正在準備付款...</h2>
            <p className="mt-2 text-sm text-fg-secondary">即將跳轉至安全付款頁面</p>
          </>
        ) : (
          <>
            <CreditCard className="mx-auto size-10 text-brand-purple" />
            <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">升級至 {planLabel || '方案'}</h2>
            <p className="mt-2 text-sm text-fg-secondary">點擊下方按鈕前往付款</p>
            <Button
              onClick={() => { formRef.current?.submit(); setPolling(true) }}
              className="mt-6 h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90"
            >
              前往付款 <ArrowRight className="ml-2 size-4" />
            </Button>
          </>
        )}

        <Link
          href={`/dashboard/subscribe/${code}`}
          className="mt-4 inline-block text-xs text-fg-muted hover:text-fg-secondary"
        >
          取消，返回方案選擇
        </Link>
      </div>

      {/* Hidden eSafe form */}
      {esafe && (
        <form ref={formRef} method="POST" action={esafe.url} className="hidden">
          {Object.entries(esafe.params).map(([key, value]) => (
            <input key={key} name={key} value={String(value)} readOnly />
          ))}
        </form>
      )}
    </div>
  )
}
