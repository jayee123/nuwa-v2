interface ProgressRingProps {
  percent: number
  size?: number
  strokeWidth?: number
}

export function ProgressRing({
  percent,
  size = 120,
  strokeWidth = 8,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-dark-elevated"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-brand-purple transition-all duration-500"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-2xl font-bold text-fg-inverse">{percent}%</span>
      </div>
    </div>
  )
}
