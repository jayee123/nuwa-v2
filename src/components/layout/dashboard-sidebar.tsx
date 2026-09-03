'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { User, KeyRound, CreditCard, Bell, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const MENU_ITEMS = [
  { href: '/dashboard/profile', label: '個人資訊', icon: User },
  { href: '/dashboard/password', label: '密碼重置', icon: KeyRound },
  { href: '/dashboard/subscribe', label: '訂閱管理', icon: CreditCard },
  { href: '/dashboard/notifications', label: '通知中心', icon: Bell },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <>
      {/* Mobile: horizontal tabs */}
      <div className="lg:hidden">
        <div className="flex items-center gap-1 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-colors',
                  isActive
                    ? 'bg-brand-purple font-medium text-white'
                    : 'text-fg-secondary hover:bg-surface-secondary'
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
          <button
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-surface-secondary"
          >
            <LogOut className="size-3.5" />
            登出
          </button>
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-fg-muted">會員服務</p>
          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-purple font-medium text-white'
                      : 'text-fg-secondary hover:bg-surface-secondary hover:text-fg-primary'
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-4 border-t border-surface-secondary pt-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
            >
              <LogOut className="size-4" />
              登出
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
