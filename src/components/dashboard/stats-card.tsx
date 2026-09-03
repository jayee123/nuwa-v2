interface StatsCardProps {
  value: string
  unit: string
  label: string
}

export function StatsCard({ value, unit, label }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-surface-secondary bg-white px-4 py-5 text-center">
      <div className="font-heading text-2xl font-bold text-brand-purple">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-fg-muted">{unit}</div>
      <div className="mt-1 text-sm text-fg-secondary">{label}</div>
    </div>
  )
}
