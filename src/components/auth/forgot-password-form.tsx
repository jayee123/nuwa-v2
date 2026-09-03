'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CountryCodeSelect } from '@/components/ui/country-code-select'
import { resetPasswordWithOtp } from '@/app/(public)/forgot-password/actions'
import { isValidPhone } from '@/lib/phone'

// --- Step 1: Phone + OTP ---
const step1Schema = z.object({
  phone: z
    .string()
    .min(1, '請輸入手機號碼')
    .refine(isValidPhone, '請輸入有效的手機號碼'),
  otp: z
    .string()
    .min(1, '請輸入驗證碼')
    .length(4, '驗證碼為 4 碼'),
})

// --- Step 2: New password ---
const step2Schema = z
  .object({
    newPassword: z.string().min(6, '密碼至少 6 個字元'),
    confirmPassword: z.string().min(1, '請再次輸入新密碼'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: '密碼不一致',
    path: ['confirmPassword'],
  })

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>

export function ForgotPasswordForm() {
  const [step, setStep] = useState(1)
  const [serverError, setServerError] = useState<string | null>(null)
  const [smsSending, setSmsSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+886')
  const [done, setDone] = useState(false)

  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { phone: '', otp: '' },
  })

  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Send SMS
  const handleSendSms = useCallback(async () => {
    form1.clearErrors('phone')
    const phoneVal = form1.getValues('phone')
    if (!isValidPhone(phoneVal)) {
      form1.setError('phone', { message: '請輸入有效的手機號碼' })
      return
    }
    setSmsSending(true)
    setServerError(null)
    try {
      const res = await fetch('/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneVal, countryCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error)
      } else {
        setCooldown(60)
      }
    } catch {
      setServerError('網路錯誤，請稍後再試')
    } finally {
      setSmsSending(false)
    }
  }, [form1])

  // Step 1: verify OTP
  async function onStep1Submit(values: Step1Values) {
    setServerError(null)
    try {
      const res = await fetch('/api/auth/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: values.phone, code: values.otp }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error)
        return
      }
      setPhone(values.phone)
      setStep(2)
    } catch {
      setServerError('網路錯誤，請稍後再試')
    }
  }

  // Step 2: reset password
  async function onStep2Submit(values: Step2Values) {
    setServerError(null)
    const result = await resetPasswordWithOtp({
      phone,
      newPassword: values.newPassword,
    })
    if (result.error) {
      setServerError(result.error)
    } else {
      setDone(true)
    }
  }

  const inputClass =
    'h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30'

  // Done state
  if (done) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-teal/20">
          <CheckCircle2 className="size-8 text-brand-teal" />
        </div>
        <div>
          <h3 className="font-heading text-2xl font-bold text-fg-primary">
            密碼已重設
          </h3>
          <p className="mt-2 text-sm text-fg-secondary">
            請使用新密碼登入
          </p>
        </div>
        <Link href="/login">
          <Button
            className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90"
            size="lg"
          >
            前往登入
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {serverError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Step 1: Phone + OTP */}
      {step === 1 && (
        <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-6">
          <div>
            <h3 className="font-heading text-2xl font-bold text-fg-primary">
              忘記密碼
            </h3>
            <p className="mt-1 text-sm text-fg-secondary">
              輸入手機號碼，我們將發送驗證碼給您
            </p>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">手機號碼</label>
            <div className="flex gap-2">
              <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
              <Input
                {...form1.register('phone')}
                type="tel"
                placeholder="936 923 912"
                className={`flex-1 ${inputClass}`}
              />
            </div>
            {form1.formState.errors.phone && (
              <p className="text-xs text-destructive">
                {form1.formState.errors.phone.message}
              </p>
            )}
          </div>

          {/* OTP */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">驗證碼</label>
            <div className="flex gap-2">
              <Input
                {...form1.register('otp')}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="4 碼驗證碼"
                className={`flex-1 ${inputClass}`}
              />
              <Button
                type="button"
                onClick={handleSendSms}
                disabled={smsSending || cooldown > 0}
                className="h-11 whitespace-nowrap rounded-xl bg-surface-inverse px-4 text-sm text-fg-inverse hover:bg-surface-inverse/90 disabled:opacity-50"
              >
                {smsSending
                  ? '發送中...'
                  : cooldown > 0
                    ? `${cooldown}s`
                    : '發送驗證碼'}
              </Button>
            </div>
            {form1.formState.errors.otp && (
              <p className="text-xs text-destructive">
                {form1.formState.errors.otp.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={form1.formState.isSubmitting}
            className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
            size="lg"
          >
            {form1.formState.isSubmitting ? '驗證中...' : '驗證手機'}
          </Button>

          <p className="text-center text-sm text-fg-secondary">
            想起密碼了？{' '}
            <Link
              href="/login"
              className="font-medium text-fg-primary underline underline-offset-4 hover:text-accent-primary"
            >
              前往登入
            </Link>
          </p>
        </form>
      )}

      {/* Step 2: New password */}
      {step === 2 && (
        <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-6">
          <div>
            <h3 className="font-heading text-2xl font-bold text-fg-primary">
              設定新密碼
            </h3>
            <p className="mt-1 text-sm text-fg-secondary">
              請輸入您的新密碼（至少 6 個字元）
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">新密碼</label>
            <div className="relative">
              <Input
                {...form2.register('newPassword')}
                type={showNew ? 'text' : 'password'}
                placeholder="請輸入新密碼"
                className={`pr-10 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {form2.formState.errors.newPassword && (
              <p className="text-xs text-destructive">
                {form2.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">確認新密碼</label>
            <div className="relative">
              <Input
                {...form2.register('confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                placeholder="請再次輸入新密碼"
                className={`pr-10 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {form2.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {form2.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => setStep(1)}
              variant="outline"
              className="h-12 flex-1 rounded-xl text-base"
              size="lg"
            >
              上一步
            </Button>
            <Button
              type="submit"
              disabled={form2.formState.isSubmitting}
              className="h-12 flex-1 rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
              size="lg"
            >
              {form2.formState.isSubmitting ? '重設中...' : '重設密碼'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
