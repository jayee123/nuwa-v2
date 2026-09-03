import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, User, CreditCard, Puzzle, LayoutGrid } from 'lucide-react'

export const metadata: Metadata = {
  title: '會員中心 — 羽升幸福養成學苑',
}

const QUICK_LINKS = [
  { href: '/dashboard/apps', label: 'App 服務', desc: '進入各個應用（登入自動帶過去）', icon: LayoutGrid, color: 'bg-brand-purple/10 text-brand-purple' },
  { href: '/dashboard/practice/unpack', label: '我卡住，幫我拆', desc: '說出卡點，小羽幫你拆解', icon: Puzzle, color: 'bg-brand-purple/10 text-brand-purple' },
  { href: '/dashboard/profile', label: '個人資料', desc: '管理你的帳號資訊', icon: User, color: 'bg-surface-secondary text-fg-secondary' },
  { href: '/dashboard/password', label: '密碼變更', desc: '更新你的登入密碼', icon: CreditCard, color: 'bg-brand-orange/10 text-brand-orange' },
  { href: '/', label: '瀏覽課程', desc: '探索更多學習內容', icon: BookOpen, color: 'bg-brand-rose/10 text-brand-rose' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-fg-primary">歡迎回來</h1>
        <p className="mt-2 text-sm text-fg-secondary">選擇你想做的事</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 rounded-xl border border-surface-secondary p-5 transition-colors hover:border-brand-purple/30 hover:bg-surface-primary"
            >
              <div className={`flex size-12 items-center justify-center rounded-xl ${item.color}`}>
                <item.icon className="size-6" />
              </div>
              <div>
                <p className="font-medium text-fg-primary">{item.label}</p>
                <p className="text-xs text-fg-muted">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
