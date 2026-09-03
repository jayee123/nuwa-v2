import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'App 服務 — 羽升幸福養成學苑' }
export const dynamic = 'force-dynamic'

export default async function DashboardAppsPage() {
  const admin = createAdminClient()
  const { data: apps } = await admin
    .from('apps')
    .select('slug, name, tagline, icon')
    .eq('status', 'active')
    .order('sort_order', { ascending: true })

  const list = apps ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-fg-primary">App 服務</h1>
        <p className="mt-2 text-sm text-fg-secondary">選擇要進入的應用，登入狀態會自動帶過去、不用再登入一次。</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-fg-muted shadow-sm">目前沒有可用的 App</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((app) => (
            <div key={app.slug} className="flex flex-col rounded-2xl border border-surface-secondary bg-white p-6 shadow-sm">
              <div className="text-3xl">{app.icon || '📦'}</div>
              <h2 className="mt-3 font-heading text-lg font-bold text-fg-primary">{app.name}</h2>
              <p className="mt-1 flex-1 text-sm text-fg-secondary">{app.tagline || ''}</p>
              <Link
                href={`/api/apps/${app.slug}/launch`}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                進入 <ExternalLink className="size-4" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
