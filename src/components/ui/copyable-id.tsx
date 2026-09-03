'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * NUWA ID（public.users.id）的顯示元件。
 *
 * 這個值使用者不會手打，只會複製去對帳、回報問題、或跟各 App 的後台對照，
 * 所以顯示重點是「認得出是同一個」＋「複製得走」，不是「讀得完」。
 *
 * 前台個人資訊與後台用戶列表共用同一個元件 —— 否則兩邊的截斷長度遲早會不一樣，
 * 對照時反而更難比對。
 */
export function CopyableId({
  value,
  truncate = false,
}: {
  value: string
  truncate?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 非安全來源（http 且非 localhost）沒有 clipboard API。
      // 靜默略過即可 —— 值本身仍然看得到，使用者可以自己選取複製。
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="font-mono text-xs text-fg-secondary" title={value}>
        {truncate ? `${value.slice(0, 8)}…` : value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? '已複製' : '複製 NUWA ID'}
        className="text-fg-muted transition-colors hover:text-brand-purple"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}
