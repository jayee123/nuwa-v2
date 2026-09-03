import type { Metadata } from 'next'
import Link from 'next/link'
import { Puzzle, CalendarDays } from 'lucide-react'

export const metadata: Metadata = {
  title: '練習專區 — 羽升幸福養成學苑',
}

export default function PracticePage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold text-fg-primary">
            選擇你的練習方式
          </h1>
          <p className="mt-2 text-sm text-fg-secondary">
            讓小羽陪你一起成長
          </p>
        </div>

        <div className="space-y-4">
          {/* 我卡住幫我拆 */}
          <Link
            href="/dashboard/practice/unpack"
            className="group flex items-center gap-5 rounded-2xl border border-surface-secondary bg-white p-6 shadow-sm transition-all hover:border-brand-purple/40 hover:shadow-md"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-purple/10 text-brand-purple transition-colors group-hover:bg-brand-purple group-hover:text-white">
              <Puzzle className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-fg-primary">我卡住幫我拆</p>
              <p className="mt-1 text-sm text-fg-muted">
                遇到關係卡點？說出來，小羽幫你拆解
              </p>
            </div>
            <div className="shrink-0 text-fg-muted transition-colors group-hover:text-brand-purple">
              →
            </div>
          </Link>

          {/* 21 天刻意練習（入口已收攏到 App） */}
          <Link
            href="/dashboard/apps"
            className="group flex items-center gap-5 rounded-2xl border border-surface-secondary bg-white p-6 shadow-sm transition-all hover:border-brand-teal/40 hover:shadow-md"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal transition-colors group-hover:bg-brand-teal group-hover:text-white">
              <CalendarDays className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-fg-primary">21 天刻意練習</p>
              <p className="mt-1 text-sm text-fg-muted">
                每天一個練習，養成高情商溝通習慣（在 App 裡進行）
              </p>
            </div>
            <div className="shrink-0 text-fg-muted transition-colors group-hover:text-brand-teal">
              →
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
