import type { Metadata } from 'next'
import { getAdminCtx, getAccessibleAppIds } from '@/lib/app-access'
import { AppsManager } from '@/components/manage/apps-manager'

export const metadata: Metadata = { title: 'App 管理 — 羽升管理後台' }
export const dynamic = 'force-dynamic'

function maskSecret(s: string | null): string | null {
  return s ? `${s.slice(0, 8)}••••••` : null
}

export default async function ManageAppsPage() {
  const ctx = await getAdminCtx()
  if (!ctx) {
    return <div className="p-6 text-red-500">無後台權限</div>
  }

  const accessible = await getAccessibleAppIds(ctx) // null = 全部（superadmin）
  if (accessible !== null && accessible.length === 0) {
    return (
      <div>
        <AppsManager initialApps={[]} isSuper={false} />
      </div>
    )
  }

  let query = ctx.admin
    .from('apps')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (accessible !== null) query = query.in('id', accessible)

  const [appsRes, bindingsRes] = await Promise.all([query, ctx.admin.from('user_apps').select('app_id')])

  const countByApp = new Map<string, number>()
  for (const b of bindingsRes.data ?? []) {
    countByApp.set(b.app_id, (countByApp.get(b.app_id) ?? 0) + 1)
  }

  const apps = (appsRes.data ?? []).map((a) => ({
    ...a,
    sso_secret: maskSecret(a.sso_secret),
    entitlement_key: maskSecret(a.entitlement_key),
    user_count: countByApp.get(a.id) ?? 0,
  }))

  return (
    <div>
      <AppsManager initialApps={apps} isSuper={ctx.isSuper} />
    </div>
  )
}
