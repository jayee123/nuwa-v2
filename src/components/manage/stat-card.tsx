import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  change?: string
  changeType?: 'up' | 'down' | 'neutral'
  icon: LucideIcon
}

export function StatCard({ label, value, change, changeType = 'up', icon: Icon }: StatCardProps) {
  const changeColor =
    changeType === 'up'
      ? 'text-brand-teal'
      : changeType === 'down'
        ? 'text-destructive'
        : 'text-fg-muted'

  return (
    <div className="rounded-xl border border-surface-secondary bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-fg-secondary">{label}</span>
        <Icon className="size-5 text-fg-muted" />
      </div>
      <p className="mt-2 font-heading text-3xl font-bold text-fg-primary">{value}</p>
      {change && (
        <p className={`mt-1 text-xs ${changeColor}`}>{change}</p>
      )}
    </div>
  )
}
