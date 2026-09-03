import type { Metadata } from 'next'
import { PublicUnpackChat } from '@/components/unpack/public-unpack-chat'

export const metadata: Metadata = {
  title: '我卡住了 — 羽升幸福養成學苑',
}

export default function StuckPage() {
  return (
    <div className="min-h-screen bg-surface-primary px-4 py-8">
      <PublicUnpackChat />
    </div>
  )
}
