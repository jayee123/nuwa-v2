'use client'

import { COUNTRY_CODES } from '@/lib/phone'

interface CountryCodeSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function CountryCodeSelect({ value, onChange, disabled }: CountryCodeSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-11 rounded-xl border border-surface-secondary bg-surface-secondary px-2 text-sm text-fg-primary outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30 disabled:opacity-50"
    >
      {COUNTRY_CODES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.code}
        </option>
      ))}
    </select>
  )
}
