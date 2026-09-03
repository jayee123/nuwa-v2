import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'default' | 'white' | 'icon'
  className?: string
  href?: string
}

export function Logo({ variant = 'default', className, href = '/' }: LogoProps) {
  const content = (
    <div className={cn('flex items-center gap-2', className)}>
      <Image
        src="/images/logo-full.png"
        alt="羽升幸福養成學苑"
        width={180}
        height={45}
        className={cn(
          'h-8 w-auto object-contain',
          variant === 'white' && 'brightness-0 invert'
        )}
        priority
      />
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}
