import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { InviteRedeemForm } from '@/components/apps/invite-redeem-form'

export const metadata: Metadata = { title: '輸入邀請碼 — 羽升幸福養成學苑' }
export const dynamic = 'force-dynamic'

// 封測（internal）App 的邀請碼入口 —— launch gate 判定 need_invite 時導來這裡。
// 兌換成功後由表單元件把人送回 /api/apps/:slug/launch（此時試用已建立、gate 放行）。
export default async function AppInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>
}) {
  const { app: slug } = await searchParams
  if (!slug) redirect('/dashboard/apps')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('apps')
    .select('slug, name, icon, tagline, status')
    .eq('slug', slug)
    .maybeSingle()

  if (!app || !['active', 'internal'].includes(app.status)) {
    redirect('/dashboard/apps?error=app_unavailable')
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="rounded-2xl border border-surface-secondary bg-white p-8 shadow-sm">
        <div className="text-4xl">{app.icon || '📦'}</div>
        <h1 className="mt-3 font-heading text-2xl font-bold text-fg-primary">{app.name}</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          {app.status === 'internal'
            ? '這個 App 目前封測中，需要邀請碼才能進入。'
            : '輸入邀請碼以開通試用。'}
        </p>
        <InviteRedeemForm slug={app.slug} />
      </div>
      <p className="text-center text-sm text-fg-muted">
        沒有邀請碼？
        <Link href="/dashboard/apps" className="text-brand-purple hover:underline">
          回 App 服務
        </Link>
      </p>
    </div>
  )
}
