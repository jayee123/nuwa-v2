'use client'

import { useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Param {
  key: string
  value: string | null
}

export function SettingsEditor({ params: initial }: { params: Param[] }) {
  const [params, setParams] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function updateValue(key: string, value: string) {
    setParams((prev) => prev.map((p) => (p.key === key ? { ...p, value } : p)))
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/manage/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    })
    setSaving(false)
    setMsg(res.ok ? '已儲存' : '儲存失敗')
  }

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3 w-1/3">Key</th>
              <th className="px-5 py-3">Value</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.key} className="border-b border-surface-secondary last:border-0">
                <td className="px-5 py-3 font-mono text-xs text-fg-secondary">{p.key}</td>
                <td className="px-5 py-3">
                  <Input
                    value={p.value ?? ''}
                    onChange={(e) => updateValue(p.key, e.target.value)}
                    className="h-8 rounded-lg text-sm"
                  />
                </td>
              </tr>
            ))}
            {params.length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-8 text-center text-fg-muted">尚無系統參數</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <p className={`mt-3 text-sm ${msg === '已儲存' ? 'text-brand-teal' : 'text-destructive'}`}>{msg}</p>}

      <div className="mt-4 flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-brand-purple text-sm text-white hover:bg-brand-purple/90"
        >
          <Save className="mr-1.5 size-4" /> {saving ? '儲存中...' : '儲存設定'}
        </Button>
      </div>
    </div>
  )
}
