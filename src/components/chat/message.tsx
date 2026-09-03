import { cn } from '@/lib/utils'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
}

export function Message({ role, content }: MessageProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'size-8 shrink-0 rounded-full',
          isUser ? 'bg-brand-purple/30' : 'bg-brand-teal/30'
        )}
      />
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-brand-purple text-white'
            : 'bg-dark-elevated text-fg-inverse dark:bg-dark-elevated'
        )}
      >
        {content}
      </div>
    </div>
  )
}
