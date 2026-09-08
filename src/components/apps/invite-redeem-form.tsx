'use client'

import { useState } from 'react'

// 邀請碼兌換表單：POST /api/apps/:slug/invite，成功後直接進 launch。
// 錯誤訊息由 API 給（那裡刻意不區分「不存在」與「已使用」，防列舉）。
export function InviteRedeemForm({ slug }: { slug: string }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/apps/${slug}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '兌換失敗，請稍後再試')
        return
      }
      window.location.href = json.data.launch
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="輸入邀請碼"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={64}
        className="w-full rounded-xl border border-surface-secondary px-4 py-3 font-mono text-sm tracking-widest focus:border-brand-purple focus:outline-none"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="w-full rounded-xl bg-brand-purple px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? '兌換中…' : '兌換並進入'}
      </button>
    </form>
  )
}
