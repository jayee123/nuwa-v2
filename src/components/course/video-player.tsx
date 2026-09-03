'use client'

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'

interface VideoPlayerProps {
  url: string | null
}

function parseVideoUrl(url: string): { provider: 'youtube' | 'vimeo'; embedUrl: string } | null {
  // YouTube: youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (ytShort) return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytShort[1]}` }

  const ytWatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/)
  if (ytWatch) return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytWatch[1]}` }

  const ytEmbed = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/)
  if (ytEmbed) return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytEmbed[1]}` }

  // Vimeo: vimeo.com/ID, player.vimeo.com/video/ID
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeo[1]}` }

  const vimeoPlayer = url.match(/player\.vimeo\.com\/video\/(\d+)/)
  if (vimeoPlayer) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeoPlayer[1]}` }

  return null
}

export function VideoPlayer({ url }: VideoPlayerProps) {
  const parsed = useMemo(() => (url ? parseVideoUrl(url) : null), [url])

  if (!url || !parsed) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4 text-white/40">
          <div className="flex size-16 items-center justify-center rounded-full border-2 border-current">
            <ChevronRight className="ml-1 size-8" />
          </div>
          <span className="text-sm">{url ? '不支援的影片連結' : '選擇課程單元開始學習'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        src={parsed.embedUrl}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="課程影片"
      />
    </div>
  )
}
