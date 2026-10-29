import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { SettingsEditor } from '@/components/manage/settings-editor'
import { SecretParamsEditor } from '@/components/manage/secret-params-editor'
import { TrialDefaultsEditor } from '@/components/manage/trial-defaults-editor'
import { getTrialDefaults } from '@/lib/trial-defaults'

export const metadata: Metadata = { title: '系統設定 — 羽升管理後台' }

export default async function ManageSettingsPage() {
  const admin = createAdminClient()
  const { data: params } = await admin
    .from('system_params')
    .select('*')
    .order('key')
  const trialDefaults = await getTrialDefaults(admin)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">系統設定</h1>

      {/* App 試用預設（A 方案，migration 035） */}
      <TrialDefaultsEditor initial={trialDefaults} />

      {/* Environment Variables */}
      <SecretParamsEditor />

      {/* System Params */}
      <h2 className="mt-10 text-lg font-semibold text-fg-primary">一般參數</h2>
      <SettingsEditor params={params ?? []} />
    </div>
  )
}
