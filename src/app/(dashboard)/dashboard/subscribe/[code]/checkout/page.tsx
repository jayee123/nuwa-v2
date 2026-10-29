'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, CreditCard, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** /api/payment/quote 的回應：這次要收多少、算首次付款還是升級（PAY-22） */
interface Quote {
  planName: string
  monthlyCharge: number
  kind: 'first' | 'upgrade' | 'free_upgrade'
  amount: number
  endsAt?: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
}

/** 結帳金額說明：升級只收差價、到期日不變（PAY-20），要讓使用者在刷卡前就知道 */
function chargeSummary(quote: Quote): string {
  if (quote.kind === 'free_upgrade' && quote.endsAt) {
    return `這次不收費，到期日維持 ${formatDate(quote.endsAt)}`
  }
  if (quote.kind === 'upgrade' && quote.endsAt) {
    return `升級差價 NT$ ${quote.amount}，到期日維持 ${formatDate(quote.endsAt)}`
  }
  return `NT$ ${quote.amount}，自付款日起一個月`
}

/** 確認畫面第二行：之後怎麼扣款 */
function renewalNote(quote: Quote): string {
  if (quote.kind === 'free_upgrade') {
    return `新方案與目前方案價格相同。到期後每月以新方案 NT$ ${quote.monthlyCharge} 自動扣款，用原本綁定的卡。`
  }
  if (quote.kind === 'upgrade') {
    return `到期後每月以新方案 NT$ ${quote.monthlyCharge} 自動扣款，用這次付款的卡。`
  }
  return '之後每月以同一張卡自動扣款。'
}

/** 先開好的空白視窗：在等伺服器建單時先告訴使用者發生什麼事 */
function showConnecting(win: Window) {
  try {
    win.document.title = '前往紅陽付款…'
    win.document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;color:#555">正在前往紅陽付款頁…</p>'
  } catch { /* 瀏覽器不讓寫就算了，等一下會直接導到紅陽 */ }
}

export default function CheckoutPage({
  params: paramsPromise,
}: {
  params: Promise<{ code: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planCode = searchParams.get('plan') ?? ''

  const [code, setCode] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [payUrl, setPayUrl] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)
  const [paymentFailed, setPaymentFailed] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  // 連點兩下時 state 還沒更新、按鈕還沒變灰，用 ref 擋第二次，才不會建兩筆單
  const inFlight = useRef(false)

  // Resolve params
  useEffect(() => {
    paramsPromise.then((p) => setCode(p.code))
  }, [paramsPromise])

  // 試算：只算金額給使用者確認，不建訂單、不連紅陽（PAY-22）。
  // 以前一進頁面就建單並自動開紅陽視窗：每點一次方案就多一筆訂單，也來不及取消（Steve 10/18 C-2）。
  const loadQuote = useCallback(async () => {
    if (!code || !planCode) return
    setQuote(null)
    setError(null)
    try {
      const res = await fetch(`/api/payment/quote?plan=${encodeURIComponent(planCode)}&service=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '無法計算金額，請稍後再試')
        return
      }
      setQuote(data as Quote)
    } catch {
      setError('系統錯誤，請重試')
    }
  }, [code, planCode])

  useEffect(() => {
    loadQuote()
  }, [loadQuote])

  const openPayment = useCallback(() => {
    if (payUrl && window.open(payUrl, 'sunpay_payment')) setPolling(true)
  }, [payUrl])

  // 按下「前往付款」／「確定升級」才建訂單。
  // 紅陽視窗要在點擊當下先開（空白），等建好單再導過去 —— 等 API 回來才開會被瀏覽器當成彈窗擋掉。
  const startPayment = useCallback(async () => {
    if (!quote || inFlight.current) return
    if (payUrl) {
      // 單已經建好（例如剛才視窗被擋）：只重開同一個付款連結，不再建第二筆
      openPayment()
      return
    }
    inFlight.current = true
    setSubmitting(true)
    setNotice(null)
    const win = quote.kind === 'free_upgrade' ? null : window.open('', 'sunpay_payment')
    if (win) showConnecting(win)
    try {
      // 金額由伺服器依方案表計算；帶上確認畫面的金額只是讓伺服器比對，不一樣就不建單
      const res = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode, serviceCode: code, expectedAmount: quote.amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        win?.close()
        if (res.status === 409) {
          setNotice(data.error ?? '價格已更新，請重新確認')
          await loadQuote()
          return
        }
        setError(data.error ?? '付款初始化失敗')
        return
      }
      // 定價相同的升級：伺服器已直接升好、不用付款（PAY-20），直接到完成頁
      if (data.kind === 'free_upgrade') {
        router.push(`/dashboard/subscribe/success?td=${data.paymentUid}`)
        return
      }
      setPayUrl(data.payUrl)
      setPaymentId(data.paymentId)
      // 視窗被擋或被關掉：畫面改顯示「前往付款」讓使用者自己點
      if (win && !win.closed) {
        win.location.href = data.payUrl
        setPolling(true)
      }
    } catch {
      win?.close()
      setError('系統錯誤，請重試')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [quote, payUrl, openPayment, planCode, code, loadQuote, router])

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
        } else if (data.status === 'failed') {
          // 紅陽通知付款失敗：停止等待、告訴使用者，不要一直轉圈
          setPaymentFailed(true)
          setPolling(false)
        }
      }
    } catch { /* ignore */ }
  }, [paymentId, router])

  // 取消付款：把這筆待付款標成已取消再離開，不是只換頁（Steve 10/17 P-N2）。
  // 通知比按鈕先到、其實已經付成功時，改跳成功頁。還沒建單就直接回方案頁。
  const cancelPayment = useCallback(async () => {
    const backToPlans = `/dashboard/subscribe/${code}`
    if (!paymentId) {
      router.push(backToPlans)
      return
    }
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/payment/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCancelError(data.error ?? '取消失敗，請稍後再試')
        return
      }
      if (data.status === 'paid') {
        setPolling(false)
        setPaymentDone(true)
        router.push(`/dashboard/subscribe/success?td=${data.paymentUid}`)
        return
      }
      router.push(backToPlans)
    } catch {
      setCancelError('取消失敗，請稍後再試')
    } finally {
      setCancelling(false)
    }
  }, [code, paymentId, router])

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

  if (paymentFailed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto size-12 text-destructive" />
          <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">付款沒有成功</h2>
          <p className="mt-2 text-sm text-fg-secondary">紅陽回覆這筆付款沒有成功，請確認卡片資料後重新付款。</p>
          <Link href={`/dashboard/subscribe/${code}`}>
            <Button variant="outline" className="mt-6">
              回到方案選擇重新付款
            </Button>
          </Link>
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
            請在紅陽付款視窗完成刷卡，完成後此頁面會自動跳轉
          </p>
          {quote && <p className="mt-2 text-sm font-medium text-fg-primary">{chargeSummary(quote)}</p>}
          <p className="mt-4 text-xs text-fg-muted">
            付款視窗被關掉了？
            <button onClick={openPayment} className="ml-1 text-brand-purple underline">
              重新開啟付款視窗
            </button>
          </p>
          {/* 取消是正式按鈕、跟「重新開啟」分開，不再是一行小字（Steve 10/18） */}
          <Button
            onClick={cancelPayment}
            disabled={cancelling}
            variant="outline"
            className="mt-8 h-11 w-full rounded-xl text-sm"
          >
            {cancelling ? '取消中...' : '取消付款'}
          </Button>
          {cancelError && <p className="mt-2 text-xs text-destructive">{cancelError}</p>}
        </div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto size-10 animate-spin text-brand-purple" />
          <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">正在計算金額...</h2>
        </div>
      </div>
    )
  }

  const isFreeUpgrade = quote.kind === 'free_upgrade'
  const blocked = payUrl !== null // 單建好了，但紅陽視窗被瀏覽器擋下或被關掉

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <CreditCard className="mx-auto size-10 text-brand-purple" />
        <h2 className="mt-4 font-heading text-xl font-bold text-fg-primary">
          {quote.kind === 'first' ? `訂閱「${quote.planName}」` : `升級至「${quote.planName}」`}
        </h2>
        <p className="mt-4 text-base font-medium text-fg-primary">{chargeSummary(quote)}</p>
        <p className="mt-2 text-sm text-fg-secondary">{renewalNote(quote)}</p>
        {notice && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
        {blocked && (
          <p className="mt-4 text-sm text-fg-secondary">付款視窗沒有打開（可能被瀏覽器擋下），請按下方按鈕前往付款。</p>
        )}

        <Button
          onClick={startPayment}
          disabled={submitting}
          className="mt-6 h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> 處理中...
            </>
          ) : isFreeUpgrade ? (
            '確定升級'
          ) : (
            <>
              前往付款 <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
        {!isFreeUpgrade && !blocked && (
          <p className="mt-2 text-xs text-fg-muted">會另開紅陽的安全付款視窗</p>
        )}

        <Button
          onClick={cancelPayment}
          disabled={cancelling || submitting}
          variant="outline"
          className="mt-3 h-11 w-full rounded-xl text-sm"
        >
          {cancelling ? '取消中...' : blocked ? '取消付款' : '返回方案選擇'}
        </Button>
        {cancelError && <p className="mt-2 text-xs text-destructive">{cancelError}</p>}
      </div>
    </div>
  )
}
