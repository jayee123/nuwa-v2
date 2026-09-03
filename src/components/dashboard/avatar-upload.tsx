'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AvatarUploadProps {
  currentUrl: string | null
  nickname: string
}

export function AvatarUpload({ currentUrl, nickname }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
      } else {
        setAvatarUrl(data.avatarUrl + '?t=' + Date.now())
      }
    } catch {
      setError('上傳失敗，請稍後再試')
    } finally {
      setUploading(false)
      // Reset input so same file can be selected again
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const initials = (nickname || '?').slice(0, 1).toUpperCase()

  return (
    <div className="flex items-center gap-4">
      {/* Avatar */}
      <div className="relative">
        <div className="size-14 overflow-hidden rounded-full bg-brand-purple/20">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={nickname}
              width={56}
              height={56}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xl font-bold text-brand-purple">
              {initials}
            </div>
          )}
        </div>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Upload button */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg text-xs"
        >
          <Camera className="mr-1.5 size-3.5" />
          {uploading ? '上傳中...' : '更換頭像'}
        </Button>
        <p className="mt-1 text-[11px] text-fg-muted">JPG、PNG，最大 2MB</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
