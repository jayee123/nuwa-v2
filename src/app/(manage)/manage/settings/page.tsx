import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { SettingsEditor } from '@/components/manage/settings-editor'
import { SecretParamsEditor } from '@/components/manage/secret-params-editor'

export const metadata: Metadata = { title: '系統設定 — 羽升管理後台' }

export default async function ManageSettingsPage() {
  const admin = createAdminClient()
  const { data: params } = await admin
    .from('system_params')
    .select('*')
    .order('key')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">系統設定</h1>

      {/* Environment Variables */}
      <SecretParamsEditor />

      {/* System Params */}
      <h2 className="mt-10 text-lg font-semibold text-fg-primary">一般參數</h2>
      <SettingsEditor params={params ?? []} />
    </div>
  )
}
