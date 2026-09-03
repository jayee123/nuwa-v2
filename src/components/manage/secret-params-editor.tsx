'use client'

import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SecretParam {
  key: string
  description: string | null
  updated_at: string | null
  hasValue: boolean
  maskedValue: string
}

// Group keys by category for display
const CATEGORIES: { title: string; keys: string[] }[] = [
  {
    title: 'AI 對話',
    keys: ['OPENAI_API_KEY'],
  },
  {
    title: 'esafe 金流',
    keys: [
      'ESAFE_MERCHANT_ID',
      'ESAFE_PASSWORD',
      'ESAFE_ENC_KEY',
      'ESAFE_ENC_IV',
      'ESAFE_BIND_URL',
      'ESAFE_PASSCODE_URL',
      'ESAFE_TRANS_URL',
    ],
  },
  {
    title: 'Email & 簡訊',
    keys: ['RESEND_API_KEY', 'SMS_API_KEY', 'SMS_TEST_MODE'],
  },
  {
    title: 'Cron Job',
    keys: ['CRON_SECRET'],
  },
]

export function SecretParamsEditor() {
  const [params, setParams] = useState<SecretParam[]>([])
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/manage/secrets')
      .then((res) => res.json())
      .then((data) => {
        setParams(data.params ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function getParam(key: string): SecretParam | undefined {
    return params.find((p) => p.key === key)
  }

  function handleChange(key: string, value: string) {
    setEditValues((prev) => ({ ...prev, [key]: value }))
  }

  function toggleShow(key: string) {
    setShowValues((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSave() {
    const toSave = Object.entries(editValues)
      .filter(([, v]) => v.trim())
      .map(([key, value]) => ({ key, value }))

    if (toSave.length === 0) {
      setMsg('沒有需要儲存的變更')
      return
    }

    setSaving(true)
    setMsg(null)

    const res = await fetch('/api/manage/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: toSave }),
    })

    setSaving(false)

    if (res.ok) {
      setMsg(`已儲存 ${toSave.length} 個金鑰`)
      setEditValues({})
      // Refresh
      const data = await (await fetch('/api/manage/secrets')).json()
      setParams(data.params ?? [])
    } else {
      setMsg('儲存失敗')
    }
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-xl border border-surface-secondary bg-white p-8 text-center text-sm text-fg-muted">
        載入中…
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="size-4 text-brand-purple" />
        <h2 className="text-lg font-semibold text-fg-primary">環境變數 / API 金鑰</h2>
      </div>
      <p className="mb-4 text-xs text-fg-muted">
        這些金鑰儲存在資料庫中（僅管理者可存取），優先於 Vercel 環境變數。留空則使用 Vercel 設定的值。
      </p>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => (
          <div key={cat.title} className="rounded-xl border border-surface-secondary bg-white">
            <div className="border-b border-surface-secondary px-5 py-3">
              <p className="text-sm font-medium text-fg-primary">{cat.title}</p>
            </div>
            <div className="divide-y divide-surface-secondary">
              {cat.keys.map((key) => {
                const param = getParam(key)
                const isEditing = key in editValues
                const showRaw = showValues[key]

                return (
                  <div key={key} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-48 shrink-0">
                      <p className="font-mono text-xs font-medium text-fg-primary">{key}</p>
                      {param?.description && (
                        <p className="mt-0.5 text-[10px] text-fg-muted">{param.description}</p>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showRaw ? 'text' : 'password'}
                          placeholder={param?.hasValue ? param.maskedValue : '尚未設定'}
                          value={editValues[key] ?? ''}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-full rounded-lg border border-surface-secondary bg-white px-3 py-1.5 pr-8 font-mono text-xs text-fg-primary outline-none focus:border-brand-purple"
                        />
                        <button
                          onClick={() => toggleShow(key)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary"
                        >
                          {showRaw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                      </div>
                      <Badge
                        className={`shrink-0 text-[10px] ${
                          param?.hasValue ? 'bg-brand-teal text-white' : 'bg-fg-muted/20 text-fg-muted'
                        }`}
                      >
                        {param?.hasValue ? '已設定' : '未設定'}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <p className={`mt-3 text-sm ${msg.includes('失敗') ? 'text-destructive' : 'text-brand-teal'}`}>
          {msg}
        </p>
      )}

      <div className="mt-4">
        <button
          onClick={handleSave}
          disabled={saving || Object.keys(editValues).length === 0}
          className="flex items-center gap-1.5 rounded-xl bg-brand-purple px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-purple/90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? '儲存中…' : '儲存金鑰'}
        </button>
      </div>
    </div>
  )
}
