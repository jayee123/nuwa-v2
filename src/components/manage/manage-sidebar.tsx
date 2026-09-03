'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  BarChart3,
  Users,
  CreditCard,
  ExternalLink,
  CalendarCheck,
  LayoutGrid,
  Tags,
  FileCode2,
  Ticket,
  History,
  Cpu,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Market 平台後台只保留「用戶 + 交易 + App + 統計」。
// 課程 / 系統（師資、服務方案、對話…）屬 App 層課程後台（Steve 的 nexthappy），
// 頁面與 API 保留在程式碼中、僅從側欄隱藏，之後確定不用再刪。
//
// 例外：AI 用量在 023 之後改為跨 App 歸戶（以會員為單位彙總各 App 的 token 與成本），
// 已經是平台層資訊而非單一 App 的事，因此放回側欄。
const SECTIONS = [
  {
    title: '總覽',
    items: [
      { href: '/manage', label: '統計總覽', icon: BarChart3 },
      { href: '/manage/ai-usage', label: 'AI 用量', icon: Cpu },
      { href: '/manage/users', label: '用戶管理', icon: Users },
      { href: '/manage/audit', label: '操作記錄', icon: History },
    ],
  },
  {
    title: '平台',
    items: [
      { href: '/manage/apps', label: 'App 管理', icon: LayoutGrid },
      { href: '/manage/invites', label: '邀請碼', icon: Ticket },
      { href: '/manage/dev-docs', label: '串接文件', icon: FileCode2 },
    ],
  },
  {
    title: '交易',
    items: [
      { href: '/manage/services', label: '方案定價', icon: Tags },
      { href: '/manage/subscriptions', label: '訂閱管理', icon: CalendarCheck },
      { href: '/manage/payments', label: '付款記錄', icon: CreditCard },
    ],
  },
  {
    // 金流、簡訊、Email、排程金鑰都存在這裡（system_params / secret_params），
    // 不是環境變數。這頁先前沒有任何入口，只能自己打網址才進得去。
    title: '系統',
    items: [
      { href: '/manage/settings', label: '系統設定', icon: Settings },
    ],
  },
]

export function ManageSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-surface-secondary bg-brand-purple">
      {/* Logo */}
      <div className="flex h-16 items-center px-5">
        <Logo variant="white" href="/manage" className="h-7" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-white/50">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === '/manage'
                    ? pathname === '/manage'
                    : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-white/20 font-medium text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 回到前臺 */}
      <div className="border-t border-white/20 px-3 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="size-4" />
          回到前臺
        </Link>
      </div>
    </aside>
  )
}
