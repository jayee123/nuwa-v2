import type { Metadata } from 'next'
import { UnpackChat } from '@/components/unpack/unpack-chat'

export const metadata: Metadata = {
  title: '我卡住幫我拆 — 羽升幸福養成學苑',
}

export default function UnpackPage() {
  return <UnpackChat />
}
