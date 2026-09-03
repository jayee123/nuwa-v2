'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, X, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Plan {
  code: string
  name: string
  price: number
  period: string
  features: string[]
  recommended?: boolean
  dialog_limit?: number
}

const PLAN_LEVEL: Record<string, number> = {
  free: 0,
  basic: 1,
  advanced: 2,
  premium: 3,
}

const CODE_TO_NAME: Record<string, string> = {
  basic: '基本方案',
  advanced: '進階方案',
  premium: 'Premium',
}

const PLAN_DETAILS: Record<string, { subtitle: string; description: string; goal: string; allFeatures: { label: string; included: boolean }[] }> = {
  basic: {
    subtitle: '啟動練習階段',
    description: '開啟你的幸福練習旅程',
    goal: '目標是「開始走在路上」',
    allFeatures: [
      { label: '每月 50 次 AI 對話', included: true },
      { label: '基本練習與引導式對話', included: true },
      { label: '透過簡單情境，認識自己的反應模式', included: true },
      { label: '建立「我可以練、我做得到」的信心感', included: true },
      { label: '反覆演練同一種情境', included: false },
      { label: '跨情境整合練習', included: false },
    ],
  },
  advanced: {
    subtitle: '深化練習階段',
    description: '讓你的改變開始穩定發生',
    goal: '目標是「讓改變不再靠運氣」',
    allFeatures: [
      { label: '每月 100 次 AI 對話', included: true },
      { label: '可反覆演練同一種情境（關係、溝通、選擇）', included: true },
      { label: '開始看懂「為什麼我會這樣反應」', included: true },
      { label: '從「試試看」進入「我知道怎麼做比較好」', included: true },
      { label: '跨情境整合練習', included: false },
    ],
  },
  premium: {
    subtitle: '整合與達成階段',
    description: '真正用在你的人生裡',
    goal: '目標是「讓你真的走到想去的地方」',
    allFeatures: [
      { label: '每月 200 次 AI 對話', included: true },
      { label: '長時間陪伴式練習（不只是單次對話）', included: true },
      { label: '跨情境整合：關係 × 情緒 × 選擇 × 行動', included: true },
      { label: '從「知道」進入「做到」，再到「做得穩」', included: true },
    ],
  },
}

export function SubscribePlans({
  serviceCode,
  serviceName,
  plans,
  currentPlan,
  dialogLimit,
  nextPlan,
  planDeadline,
}: {
  serviceCode: string
  serviceName: string
  plans: Plan[]
  currentPlan: string
  dialogLimit: number
  nextPlan: string | null
  planDeadline: string | null
}) {
  const router = useRouter()
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [downgrading, setDowngrading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const currentLevel = PLAN_LEVEL[currentPlan] ?? 0

  function getPrice(plan: Plan) {
    if (billing === 'yearly') return Math.round(plan.price * 12 * 0.8)
    return plan.price
  }

  function isCurrent(plan: Plan) {
    return plan.code === currentPlan
  }

  function getPlanAction(plan: Plan): 'current' | 'upgrade' | 'downgrade' | 'scheduled-downgrade' {
    const planCode = plan.code
    if (planCode === currentPlan) return 'current'
    if (nextPlan === planCode) return 'scheduled-downgrade'
    const planLevel = PLAN_LEVEL[planCode] ?? 0
    return planLevel > currentLevel ? 'upgrade' : 'downgrade'
  }

  async function handleDowngrade(planCode: string, planName: string) {
    if (!confirm(`確定要降級至「${planName}」嗎？\n\n目前方案的權益將維持到到期日，届時自動切換為新方案。`)) return

    setDowngrading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/subscription/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode, serviceCode }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message)
        router.refresh()
      } else {
        setMessage(data.error ?? '降級失敗')
      }
    } catch {
      setMessage('系統錯誤，請重試')
    } finally {
      setDowngrading(false)
    }
  }

  async function handleCancelDowngrade() {
    setCancelling(true)
    setMessage(null)
    try {
      const res = await fetch('/api/subscription/downgrade', { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setMessage('已取消降級排程')
        router.refresh()
      } else {
        setMessage(data.error ?? '取消失敗')
      }
    } catch {
      setMessage('系統錯誤')
    } finally {
      setCancelling(false)
    }
  }

  const deadlineDisplay = planDeadline
    ? new Date(planDeadline).toLocaleDateString('zh-TW')
    : ''

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-fg-secondary hover:text-fg-primary">
          &larr; 回到訂閱管理
        </Link>
      </div>

      <div className="mt-6 text-center">
        <h1 className="font-heading text-3xl font-bold text-fg-primary">請選擇訂閱方案</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          所有課程共用對話額度，升級即刻生效
        </p>

        {/* Billing toggle */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-surface-secondary p-1">
          <button
            onClick={() => setBilling('monthly')}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              billing === 'monthly' ? 'bg-white text-fg-primary shadow-sm' : 'text-fg-muted'
            )}
          >
            月繳
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              billing === 'yearly' ? 'bg-white text-fg-primary shadow-sm' : 'text-fg-muted'
            )}
          >
            年繳
          </button>
          {billing === 'yearly' && (
            <Badge className="rounded-full bg-brand-orange text-[10px] text-white">省 20%</Badge>
          )}
        </div>

        <p className="mt-3 text-xs text-fg-muted">
          ● 目前方案：{currentPlan === 'free' ? '免費' : CODE_TO_NAME[currentPlan] ?? currentPlan}（剩餘 {dialogLimit} 次）
          {deadlineDisplay && ` · 到期日：${deadlineDisplay}`}
        </p>

        {/* Scheduled downgrade notice */}
        {nextPlan && nextPlan !== currentPlan && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700">
            <Clock className="size-3.5" />
            <span>已排定於 {deadlineDisplay} 後降級至「{CODE_TO_NAME[nextPlan] ?? nextPlan}」</span>
            <button
              onClick={handleCancelDowngrade}
              disabled={cancelling}
              className="ml-1 rounded px-2 py-0.5 text-amber-900 underline hover:bg-amber-100 disabled:opacity-50"
            >
              {cancelling ? '取消中...' : '取消降級'}
            </button>
          </div>
        )}

        {/* Status message */}
        {message && (
          <p className="mt-3 text-xs text-brand-teal">{message}</p>
        )}
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const details = PLAN_DETAILS[plan.code]
          const action = getPlanAction(plan)
          const current = action === 'current'
          const isPremium = plan.code === 'premium'
          // 卡片實際是不是深色底：current 會把背景蓋成白底（見下方 className），
          // 此時文字仍用 isPremium 判斷就會變成白底白字 → 文字色一律看 isDark。
          const isDark = isPremium && !current
          const price = getPrice(plan)
          const yearlyMonthly = billing === 'yearly' ? Math.round(price / 12) : null

          return (
            <div
              key={plan.code}
              className={cn(
                'flex flex-col rounded-2xl border-2 p-6 transition-shadow',
                current
                  ? 'border-brand-purple bg-white shadow-md'
                  : isPremium
                    ? 'border-surface-inverse bg-surface-inverse text-fg-inverse'
                    : 'border-surface-secondary bg-white'
              )}
            >
              <div className="flex items-center justify-between">
                {/* plans.name 已含階段名（如「Basic 啟動練習階段」），不再接 subtitle 免得重複 */}
                <span className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-fg-primary')}>
                  {plan.name}
                </span>
                {current && <Badge className="bg-brand-purple text-[10px] text-white">目前方案</Badge>}
                {action === 'scheduled-downgrade' && (
                  <Badge className="bg-amber-500 text-[10px] text-white">已排定降級</Badge>
                )}
                {plan.recommended && action === 'upgrade' && (
                  <Badge className="bg-brand-orange text-[10px] text-white">推薦升級</Badge>
                )}
              </div>

              <div className="mt-4">
                <span className={cn('font-heading text-4xl font-bold', isDark ? 'text-white' : 'text-fg-primary')}>
                  NT$ {price.toLocaleString()}
                </span>
                <span className={cn('ml-1 text-sm', isDark ? 'text-white/60' : 'text-fg-muted')}>
                  / {billing === 'yearly' ? '年' : '月'}
                </span>
              </div>

              {yearlyMonthly && (
                <p className={cn('mt-1 text-xs', isDark ? 'text-white/50' : 'text-fg-muted')}>
                  平均 NT$ {yearlyMonthly} / 月（省 NT$ {(plan.price * 12 - price).toLocaleString()}）
                </p>
              )}

              <p className={cn('mt-2 text-sm', isDark ? 'text-white/70' : 'text-fg-secondary')}>
                {details?.description ?? ''}
              </p>

              <div className={cn('my-6 h-px', isDark ? 'bg-white/20' : 'bg-surface-secondary')} />

              <div className="flex-1 space-y-3">
                {(details?.allFeatures ?? plan.features.map((f) => ({ label: f, included: true }))).map((f) => (
                  <div key={f.label} className="flex items-center gap-2 text-sm">
                    {f.included ? (
                      <Check className="size-4 text-brand-teal" />
                    ) : (
                      <X className="size-4 text-fg-muted" />
                    )}
                    <span className={cn(f.included ? '' : 'text-fg-muted', isDark && f.included ? 'text-white' : '')}>
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Goal */}
              {details?.goal && (
                <p className={cn('mt-4 text-xs font-medium', isDark ? 'text-white/70' : 'text-fg-secondary')}>
                  ● {details.goal}
                </p>
              )}

              <div className="mt-6">
                {current ? (
                  <Button disabled className="h-11 w-full rounded-xl text-sm opacity-60">
                    目前方案
                  </Button>
                ) : action === 'scheduled-downgrade' ? (
                  <Button
                    onClick={handleCancelDowngrade}
                    disabled={cancelling}
                    variant="outline"
                    className="h-11 w-full rounded-xl text-sm"
                  >
                    {cancelling ? '取消中...' : '取消降級排程'}
                  </Button>
                ) : action === 'upgrade' ? (
                  <Link href={`/dashboard/subscribe/${serviceCode}/checkout?plan=${plan.code}&billing=${billing}`}>
                    <Button
                      className={cn(
                        'h-11 w-full rounded-xl text-sm font-medium',
                        isDark
                          ? 'bg-white text-surface-inverse hover:bg-white/90'
                          : 'bg-brand-purple text-white hover:bg-brand-purple/90'
                      )}
                    >
                      升級至 {plan.name}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleDowngrade(plan.code, plan.name)}
                    disabled={downgrading}
                    variant="outline"
                    className="h-11 w-full rounded-xl text-sm"
                  >
                    {downgrading ? '處理中...' : '降級至此方案'}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
