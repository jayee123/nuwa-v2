'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({
  email: z.string().email('請輸入有效的 Email'),
})

type FormValues = z.infer<typeof schema>

export function RegistrationConfirmForm({
  physicalCourseId,
  courseName,
}: {
  physicalCourseId: string
  courseName: string
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    try {
      const res = await fetch('/api/courses/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          physicalCourseId,
          email: data.email,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setServerError(result.error)
      } else {
        setDone(true)
      }
    } catch {
      setServerError('網路錯誤，請稍後再試')
    }
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-teal/20">
          <CheckCircle2 className="size-8 text-brand-teal" />
        </div>
        <div>
          <h3 className="font-heading text-xl font-bold text-fg-primary">
            報名成功！
          </h3>
          <p className="mt-2 text-sm text-fg-secondary">
            {courseName} 開課通知將寄送至您的 Email
          </p>
        </div>
        <Link href="/">
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl text-base"
            size="lg"
          >
            回到首頁
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-primary">
          接收通知的 Email
        </label>
        <Input
          {...register('email')}
          type="email"
          placeholder="jeff@example.com"
          className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      {serverError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
        size="lg"
      >
        {isSubmitting ? '處理中...' : '確認訂閱開課通知'}
      </Button>

      <Link href="/" className="block">
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full rounded-xl text-base"
          size="lg"
        >
          回到首頁
        </Button>
      </Link>
    </form>
  )
}
