'use client'

import { ChevronDown, Play } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Chapter {
  title: string
  duration: string
  units: { title: string; duration: string }[]
}

export function CourseAccordion({ chapters }: { chapters: Chapter[] }) {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div className="space-y-3">
      {chapters.map((ch, i) => {
        const isOpen = openIndex === i
        return (
          <div
            key={ch.title}
            className="rounded-xl border border-surface-secondary bg-white"
          >
            <button
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
              className="flex w-full items-center justify-between px-5 py-4"
            >
              <span className="text-left text-sm font-semibold text-fg-primary">
                {ch.title}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-fg-muted">{ch.duration}</span>
                <ChevronDown
                  className={cn(
                    'size-4 text-fg-muted transition-transform',
                    isOpen && 'rotate-180'
                  )}
                />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-surface-secondary px-5 py-3">
                {ch.units.map((unit) => (
                  <div
                    key={unit.title}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 text-fg-secondary">
                      <Play className="size-3.5 text-fg-muted" />
                      {unit.title}
                    </div>
                    <span className="text-xs text-fg-muted">{unit.duration}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
