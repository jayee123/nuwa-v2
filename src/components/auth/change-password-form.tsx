'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { changePassword } from '@/app/(dashboard)/dashboard/password/actions'

const schema = z
  .object({
    currentPassword: z.string().min(1, '請輸入目前密碼'),
    newPassword: z.string().min(6, '新密碼至少 6 個字元'),
    confirmPassword: z.string().min(1, '請再次輸入新密碼'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: '密碼不一致',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function ChangePasswordForm() {
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    setSuccess(false)
    const result = await changePassword({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    })
    if (result.error) {
      setServerError(result.error)
    } else {
      setSuccess(true)
      reset()
    }
  }

  const inputClass =
    'h-11 rounded-xl border-surface-secondary bg-surface-secondary pr-10 text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Current password */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-primary">目前密碼</label>
        <div className="relative">
          <Input
            {...register('currentPassword')}
            type={showCurrent ? 'text' : 'password'}
            placeholder="••••••••"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
          >
            {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.currentPassword && (
          <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
        )}
      </div>

      {/* New password */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-primary">新密碼</label>
        <div className="relative">
          <Input
            {...register('newPassword')}
            type={showNew ? 'text' : 'password'}
            placeholder="請輸入新密碼"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
          >
            {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.newPassword && (
          <p className="text-xs text-destructive">{errors.newPassword.message}</p>
        )}
      </div>

      {/* Confirm new password */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-primary">確認新密碼</label>
        <div className="relative">
          <Input
            {...register('confirmPassword')}
            type={showConfirm ? 'text' : 'password'}
            placeholder="請再次輸入新密碼"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
          >
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Messages */}
      {serverError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-brand-teal/10 px-4 py-3 text-sm text-fg-primary">
          密碼已成功更新
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 rounded-xl bg-brand-purple px-8 text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
        size="lg"
      >
        {isSubmitting ? '更新中...' : '重設密碼'}
      </Button>
    </form>
  )
}
