'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Unit {
  id: string
  title: string
  completed?: boolean
}

interface Chapter {
  id: string
  title: string
  units: Unit[]
}

interface UnitListProps {
  chapters: Chapter[]
  activeUnitId?: string
  onSelectUnit: (unitId: string) => void
}

export function UnitList({ chapters, activeUnitId, onSelectUnit }: UnitListProps) {
  const [openChapters, setOpenChapters] = useState<Set<string>>(
    new Set(chapters.length > 0 ? [chapters[0].id] : [])
  )

  function toggleChapter(id: string) {
    setOpenChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {chapters.map((ch) => {
        const isOpen = openChapters.has(ch.id)
        return (
          <div key={ch.id}>
            <button
              onClick={() => toggleChapter(ch.id)}
              className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-fg-inverse"
            >
              <div className="h-4 w-1 rounded-full bg-brand-purple" />
              {ch.title}
              <ChevronDown
                className={cn(
                  'ml-auto size-4 text-fg-muted transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </button>
            {isOpen && (
              <div className="ml-3 space-y-0.5">
                {ch.units.map((unit) => {
                  const isActive = unit.id === activeUnitId
                  return (
                    <button
                      key={unit.id}
                      onClick={() => onSelectUnit(unit.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        isActive
                          ? 'bg-brand-purple/80 text-white'
                          : 'text-fg-muted hover:text-fg-inverse'
                      )}
                    >
                      {unit.completed ? (
                        <Check className="size-3.5 text-brand-teal" />
                      ) : (
                        <div className="size-1.5 rounded-full bg-current" />
                      )}
                      {unit.title}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
