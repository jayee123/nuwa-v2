import Image from 'next/image'
import Link from 'next/link'
import { Star, Play, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface CourseCardProps {
  code: string
  title: string
  description: string
  bannerUrl?: string | null
  tag?: string
  teacherName?: string
  teacherAvatar?: string | null
  rating?: number
  studentCount?: number
  price?: number
  /** 'learn' = 已訂閱可直接學習, 'wait' = 等待開課, 'external' = 外部服務 */
  status?: 'learn' | 'wait' | 'external'
  externalUrl?: string
}

export function CourseCard({
  code,
  title,
  bannerUrl,
  tag,
  teacherName,
  teacherAvatar,
  rating = 0,
  studentCount = 0,
  price,
  status = 'wait',
  externalUrl,
}: CourseCardProps) {
  const isLearn = status === 'learn'
  const isExternal = status === 'external' && externalUrl
  // 已購買的課程改導向 App 服務（21 天教室入口已收攏到 App，見 /dashboard/apps）
  const href = isExternal ? externalUrl : isLearn ? '/dashboard/apps' : `/courses/${code}`

  // externalUrl 可以是站內路徑（如 /dashboard/apps）或真正的外部網址。
  // 只有絕對網址才開新分頁，站內路徑走 Link 保留 SPA 導航。
  const opensNewTab = Boolean(isExternal && /^https?:\/\//.test(href))

  const Wrapper = opensNewTab
    ? ({ children, className }: { children: React.ReactNode; className: string }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
      )
    : ({ children, className }: { children: React.ReactNode; className: string }) => (
        <Link href={href} className={className}>{children}</Link>
      )

  return (
    <Wrapper className="group block">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-surface-secondary bg-white shadow-sm transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_8px_24px_rgba(45,41,38,0.12)]">
        {/* Cover image */}
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-secondary">
          {bannerUrl ? (
            <Image
              src={bannerUrl}
              alt={title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-fg-muted">
              <span className="text-4xl">📚</span>
            </div>
          )}
          {tag && (
            <Badge className="absolute left-3 top-3 rounded-lg bg-brand-purple/90 text-xs text-white">
              {tag}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-5">
          <h3 className="font-heading text-lg font-semibold text-fg-primary">
            {title}
          </h3>

          {/* Teacher */}
          {teacherName && (
            <div className="mt-2 flex items-center gap-2">
              <div className="size-6 overflow-hidden rounded-full bg-brand-rose/30">
                {teacherAvatar ? (
                  <Image src={teacherAvatar} alt={teacherName} width={24} height={24} className="object-cover" />
                ) : null}
              </div>
              <span className="text-sm text-fg-secondary">{teacherName}</span>
            </div>
          )}

          {/* Rating + Price */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm text-fg-secondary">
              <Star className="size-3.5 fill-brand-orange text-brand-orange" />
              <span>{rating.toFixed(1)}</span>
              <span className="text-fg-muted">({studentCount} 位學員)</span>
            </div>
            {price != null && (
              <span className="text-sm font-semibold text-brand-orange">
                NT$ {price.toLocaleString()} 起
              </span>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* CTA */}
          {isExternal ? (
            <Button className="mt-4 h-10 w-full rounded-xl bg-brand-orange text-sm font-medium text-white hover:bg-brand-orange/90">
              <Play className="mr-1.5 size-4" />
              開始練習
            </Button>
          ) : isLearn ? (
            <Button className="mt-4 h-10 w-full rounded-xl bg-brand-purple text-sm font-medium text-white hover:bg-brand-purple/90">
              <Play className="mr-1.5 size-4" />
              立刻學習
            </Button>
          ) : (
            <Button
              variant="outline"
              className="mt-4 h-10 w-full rounded-xl border-brand-purple/30 text-sm font-medium text-brand-purple hover:bg-brand-purple/5"
            >
              <Clock className="mr-1.5 size-4" />
              等待開課
            </Button>
          )}
        </div>
      </div>
    </Wrapper>
  )
}
