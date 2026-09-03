'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Menu, X, LogOut, UserCircle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'
import { NotificationBell } from '@/components/layout/notification-bell'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/', label: '課程總覽' },
  { href: '/dashboard/subscribe/happy', label: '訂閱方案' },
  { href: '/about', label: '關於我們' } as const,
]

interface SearchResult {
  code: string
  name: string
  description: string | null
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAdmin, loading } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearchOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('services')
        .select('code, name, description')
        .ilike('name', `%${query.trim()}%`)
        .eq('is_active', true)
        .limit(5)
      setResults(data ?? [])
      setSearchOpen(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isLoggedIn = !!user

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 border-b border-surface-secondary bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Logo />

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm transition-colors hover:text-fg-primary',
                pathname === item.href
                  ? 'font-medium text-fg-primary'
                  : 'text-fg-secondary'
              )}
            >
              {item.label}
            </Link>
          ))}
          {isLoggedIn && (
            <Link
              href="/dashboard"
              className={cn(
                'text-sm font-medium transition-colors hover:text-fg-primary',
                pathname.startsWith('/dashboard')
                  ? 'text-fg-primary'
                  : 'text-fg-secondary'
              )}
            >
              會員中心
            </Link>
          )}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div ref={searchRef} className="relative hidden lg:block">
            <div className="flex items-center rounded-xl border border-surface-secondary bg-surface-secondary/50 px-3 py-1.5">
              <Search className="mr-2 size-4 text-fg-muted" />
              <input
                type="text"
                placeholder="搜尋課程..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setSearchOpen(true)}
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
                className="w-32 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-muted xl:w-40"
              />
            </div>
            {searchOpen && results.length > 0 && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-surface-secondary bg-background shadow-lg">
                {results.map((r) => (
                  <Link
                    key={r.code}
                    href={`/courses/${r.code}`}
                    onClick={() => { setSearchOpen(false); setQuery('') }}
                    className="block px-4 py-3 transition-colors hover:bg-surface-secondary/50"
                  >
                    <p className="text-sm font-medium text-fg-primary">{r.name}</p>
                    {r.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{r.description}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
            {searchOpen && query.trim() && results.length === 0 && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-surface-secondary bg-background px-4 py-3 shadow-lg">
                <p className="text-sm text-fg-muted">找不到相關課程</p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="size-9 animate-pulse rounded-full bg-surface-secondary" />
          ) : isLoggedIn ? (
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Link
                href="/dashboard/profile"
                title="個人資訊"
                className="rounded-lg p-2 text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
              >
                <UserCircle className="size-5" />
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-lg p-2 text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
                title="登出"
              >
                <LogOut className="size-5" />
              </button>
            </div>
          ) : (
            <Link href="/login">
              <Button
                className="rounded-xl bg-brand-purple px-4 text-sm text-white hover:bg-brand-purple/90"
                size="sm"
              >
                登入
              </Button>
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            className="text-fg-secondary md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="border-t border-surface-secondary bg-background px-4 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'text-sm transition-colors',
                  pathname === item.href
                    ? 'font-medium text-fg-primary'
                    : 'text-fg-secondary'
                )}
              >
                {item.label}
              </Link>
            ))}
            {isLoggedIn && (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="text-sm text-fg-secondary"
              >
                會員中心
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
