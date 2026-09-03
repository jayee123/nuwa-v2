import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Plan {
  name: string
  price: number
  period: string
  features: string[]
  recommended?: boolean
}

export function PlanSelector({
  plans,
  courseCode,
}: {
  plans: Plan[]
  courseCode: string
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-fg-primary">選擇方案</h3>
      <div className="space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              'rounded-xl border-2 p-5 transition-colors',
              plan.recommended
                ? 'border-brand-purple bg-white shadow-sm'
                : 'border-surface-secondary bg-white'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-fg-secondary">
                {plan.name}
              </span>
              {plan.recommended && (
                <Badge className="rounded-md bg-brand-purple text-[10px] text-white">
                  推薦
                </Badge>
              )}
            </div>
            <div className="mt-2">
              <span className="font-heading text-2xl font-bold text-fg-primary">
                NT$ {plan.price.toLocaleString()}
              </span>
              <span className="ml-1 text-sm text-fg-muted">/ {plan.period}</span>
            </div>
            <ul className="mt-3 space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="text-xs text-fg-secondary">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link href={`/dashboard/subscribe/${courseCode}`}>
        <Button className="mt-2 h-11 w-full rounded-xl bg-brand-purple text-sm font-medium text-white hover:bg-brand-purple/90">
          確認報名並付款
        </Button>
      </Link>
    </div>
  )
}
