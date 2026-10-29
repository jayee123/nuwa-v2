'use client'

import { useState } from 'react'
import { Save, Timer } from 'lucide-react'
import { TRIAL_DAYS_MAX, TRIAL_DIALOG_LIMIT_MAX, type TrialDefaults } from '@/lib/launch-gate'

// 系統設定「App 試用預設」（A 方案）：所有 App 的試用條件都從這裡來，
// 個別 App 要不同才到「App 管理」覆寫。

export function TrialDefaultsEditor({ initial }: { initial: TrialDefaults }) {
  const [days, setDays] = useState(String(initial.trialDays))
  const [dialogLimit, setDialogLimit] = useState(initial.trialDialogLimit == null ? '' : String(initial.trialDialogLimit))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/manage/trial-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialDays: days.trim() === '' ? null : Number(days),
          trialDialogLimit: dialogLimit.trim() === '' ? null : Number(dialogLimit),
        }),
      })
      const json = await res.json().catch(() => null)
      setMsg(res.ok ? { text: '已儲存（只影響之後新開的試用）', isError: false } : { text: json?.error ?? '儲存失敗', isError: true })
    } catch {
      setMsg({ text: '網路錯誤，請重試', isError: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Timer className="size-4 text-brand-purple" />
        <h2 className="text-lg font-semibold text-fg-primary">App 試用預設</h2>
      </div>
      <p className="mb-4 text-xs text-fg-muted">
        會員對每支 App 各有一次免費試用，天數或對話次數先到就結束。所有 App 預設用這組條件；
        個別 App 要不同，到「App 管理」編輯該 App。改動只影響之後新開的試用。
      </p>

      <div className="grid gap-4 rounded-xl border border-surface-secondary bg-white p-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-fg-primary">預設試用天數（0 = 預設不開放試用）</span>
          <input
            type="number" min={0} max={TRIAL_DAYS_MAX} step={1} value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 w-full rounded-lg border border-surface-secondary px-3 py-1.5 text-sm outline-none focus:border-brand-purple"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-fg-primary">預設試用對話次數（留空 = 不限）</span>
          <input
            type="number" min={1} max={TRIAL_DIALOG_LIMIT_MAX} step={1} value={dialogLimit} placeholder="不限"
            onChange={(e) => setDialogLimit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-surface-secondary px-3 py-1.5 text-sm outline-none focus:border-brand-purple"
          />
        </label>
      </div>

      {msg && <p className={`mt-3 text-sm ${msg.isError ? 'text-destructive' : 'text-brand-teal'}`}>{msg.text}</p>}

      <div className="mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-brand-purple px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-purple/90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? '儲存中…' : '儲存試用預設'}
        </button>
      </div>
    </div>
  )
}
