'use client'

import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'

export function AdminBanner() {
  const { isAdmin, loading } = useAuth()

  if (loading || !isAdmin) return null

  return (
    <div className="bg-brand-purple/10 border-b border-brand-purple/20">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 lg:px-8">
        <span className="text-sm text-brand-purple font-medium">
          你目前以管理者身份瀏覽
        </span>
        <Link
          href="/manage"
          className="flex items-center gap-1.5 rounded-lg bg-brand-purple px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-purple/90 transition-colors"
        >
          <Settings2 className="size-4" />
          進入管理後台
        </Link>
      </div>
    </div>
  )
}
