'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CountryCodeSelect } from '@/components/ui/country-code-select'
import { register as registerAction } from '@/app/(public)/register/actions'
import { isValidPhone } from '@/lib/phone'

// --- Schemas per step ---

const step1Schema = z.object({
  phone: z
    .string()
    .min(1, '請輸入手機號碼')
    .refine(isValidPhone, '請輸入有效的手機號碼'),
  otp: z
    .string()
    .min(1, '請輸入驗證碼')
    .length(4, '驗證碼為 4 碼'),
  invite_code: z.string().min(1, '請輸入邀請碼'),
  agree: z.literal(true, { message: '請同意服務條款' }),
})

const step2Schema = z
  .object({
    password: z.string().min(6, '密碼至少 6 個字元'),
    confirmPassword: z.string().min(1, '請再次輸入密碼'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '密碼不一致',
    path: ['confirmPassword'],
  })

const step3Schema = z.object({
  nickname: z.string().min(1, '請輸入用戶名稱').max(50, '用戶名稱最多 50 字'),
  gender: z.string().optional(),
  birthday: z.string().optional(),
  email: z
    .string()
    .min(1, '請輸入 Email（電子發票需要）')
    .refine((v) => v.includes('@'), '請輸入有效的 Email'),
})

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>
type Step3Values = z.infer<typeof step3Schema>

// --- Steps config ---

const STEPS = [
  { label: '手機驗證', num: 1 },
  { label: '驗證碼', num: 2 },
  { label: '個人資料', num: 3 },
  { label: '完成', num: 4 },
] as const

// --- Component ---

export function RegisterForm() {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [serverError, setServerError] = useState<string | null>(null)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [countryCode, setCountryCode] = useState('+886')

  // Collected data across steps
  const [collected, setCollected] = useState<{
    phone?: string
    password?: string
    countryCode?: string
    inviteCode?: string
  }>({})

  // --- Step 1 form ---
  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { phone: '', otp: '', invite_code: '', agree: false as unknown as true },
  })

  // --- Step 2 form ---
  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  // --- Step 3 form ---
  const form3 = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: { nickname: '', gender: undefined, birthday: '', email: '' },
  })

  // --- Cooldown timer ---
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // --- Send SMS ---
  const handleSendSms = useCallback(async () => {
    form1.clearErrors('phone')
    const phone = form1.getValues('phone')
    if (!isValidPhone(phone)) {
      form1.setError('phone', { message: '請輸入有效的手機號碼' })
      return
    }
    setSmsSending(true)
    setServerError(null)
    try {
      // Send the phone with country code for SMS delivery
      const cleanedPhone = phone.replace(/[\s\-()]/g, '')
      const fullPhone = countryCode === '+886'
        ? (cleanedPhone.startsWith('0') ? cleanedPhone : '0' + cleanedPhone)
        : cleanedPhone
      const res = await fetch('/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, countryCode }),
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

  // --- Step 1 submit: verify OTP ---
  async function onStep1Submit(values: Step1Values) {
    setServerError(null)
    const cleanedPhone = values.phone.replace(/[\s\-()]/g, '')
    const fullPhone = countryCode === '+886'
      ? (cleanedPhone.startsWith('0') ? cleanedPhone : '0' + cleanedPhone)
      : cleanedPhone
    try {
      const res = await fetch('/api/auth/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, code: values.otp }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error)
        return
      }
      setPhoneVerified(true)
      setCollected((prev) => ({ ...prev, phone: fullPhone, countryCode, inviteCode: values.invite_code }))
      setStep(2)
    } catch {
      setServerError('網路錯誤，請稍後再試')
    }
  }

  // --- Step 2 submit ---
  function onStep2Submit(values: Step2Values) {
    setCollected((prev) => ({ ...prev, password: values.password }))
    setStep(3)
  }

  // --- Step 3 submit: create account ---
  async function onStep3Submit(values: Step3Values) {
    setServerError(null)
    try {
      const result = await registerAction({
        phone: collected.phone!,
        password: collected.password!,
        countryCode: collected.countryCode || '+886',
        nickname: values.nickname,
        gender: values.gender ? Number(values.gender) : undefined,
        birthday: values.birthday || undefined,
        email: values.email || undefined,
        affiliateId: searchParams.get('ref') || undefined,
        inviteCode: collected.inviteCode,
      })
      if (result?.error) {
        setServerError(result.error)
      }
    } catch (e) {
      // redirect() throws NEXT_REDIRECT — let it propagate
      if (e && typeof e === 'object' && 'digest' in e) throw e
      setServerError('註冊失敗，請稍後再試')
    }
  }

  return (
    <div className="space-y-8">
      {/* Progress bar */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  step >= s.num
                    ? 'bg-brand-purple text-white'
                    : 'bg-surface-secondary text-fg-muted'
                }`}
              >
                {step > s.num ? <CheckCircle2 className="size-4" /> : s.num}
              </div>
              <span
                className={`text-xs ${
                  step >= s.num ? 'text-fg-primary' : 'text-fg-muted'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 h-px w-8 ${
                  step > s.num ? 'bg-brand-purple' : 'bg-surface-secondary'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Server error */}
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
              輸入手機號碼
            </h3>
            <p className="mt-1 text-sm text-fg-secondary">
              我們將發送驗證碼到您的手機
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
                className="h-11 flex-1 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
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
                className="h-11 flex-1 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
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

          {/* 邀請碼 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">邀請碼</label>
            <Input
              {...form1.register('invite_code')}
              type="text"
              placeholder="請輸入邀請碼"
              className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm uppercase placeholder:text-fg-muted placeholder:normal-case focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
            />
            {form1.formState.errors.invite_code && (
              <p className="text-xs text-destructive">{form1.formState.errors.invite_code.message}</p>
            )}
          </div>

          {/* Agree */}
          <label className="flex items-start gap-2 text-sm text-fg-secondary">
            <input
              type="checkbox"
              {...form1.register('agree')}
              className="mt-0.5 size-4 rounded border-surface-secondary accent-brand-purple"
            />
            <span>
              我已閱讀並同意
              <a href="/terms" target="_blank" className="text-accent-primary underline underline-offset-2 hover:text-brand-purple">服務條款</a>、
              <a href="/privacy" target="_blank" className="text-accent-primary underline underline-offset-2 hover:text-brand-purple">隱私政策</a>及
              <a href="/refund" target="_blank" className="text-accent-primary underline underline-offset-2 hover:text-brand-purple">退費政策</a>
            </span>
          </label>
          {form1.formState.errors.agree && (
            <p className="text-xs text-destructive">
              {form1.formState.errors.agree.message}
            </p>
          )}

          <Button
            type="submit"
            disabled={form1.formState.isSubmitting}
            className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
            size="lg"
          >
            {form1.formState.isSubmitting ? '驗證中...' : '驗證並繼續'}
          </Button>

          <p className="text-center text-sm text-fg-secondary">
            已有帳號？{' '}
            <Link
              href="/login"
              className="font-medium text-fg-primary underline underline-offset-4 hover:text-accent-primary"
            >
              前往登入
            </Link>
          </p>
        </form>
      )}

      {/* Step 2: Password */}
      {step === 2 && (
        <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-6">
          <div>
            <h3 className="font-heading text-2xl font-bold text-fg-primary">
              設定密碼
            </h3>
            <p className="mt-1 text-sm text-fg-secondary">
              請設定您的登入密碼（至少 6 個字元）
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">密碼</label>
            <div className="relative">
              <Input
                {...form2.register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="請輸入密碼"
                className="h-11 rounded-xl border-surface-secondary bg-surface-secondary pr-10 text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {form2.formState.errors.password && (
              <p className="text-xs text-destructive">
                {form2.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">確認密碼</label>
            <div className="relative">
              <Input
                {...form2.register('confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                placeholder="請再次輸入密碼"
                className="h-11 rounded-xl border-surface-secondary bg-surface-secondary pr-10 text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
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
              className="h-12 flex-1 rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90"
              size="lg"
            >
              下一步
            </Button>
          </div>
        </form>
      )}

      {/* Step 3: Profile */}
      {step === 3 && (
        <form onSubmit={form3.handleSubmit(onStep3Submit, (errors) => {
          // Surface any hidden validation errors
          const msgs = Object.values(errors).map((e) => e?.message).filter(Boolean)
          if (msgs.length > 0) setServerError(msgs.join(', '))
        })} className="space-y-6">
          <div>
            <h3 className="font-heading text-2xl font-bold text-fg-primary">
              個人資料
            </h3>
            <p className="mt-1 text-sm text-fg-secondary">
              填寫基本資料，讓我們更了解你
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">用戶名稱</label>
            <Input
              {...form3.register('nickname')}
              placeholder="你希望被怎麼稱呼？"
              className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
            />
            {form3.formState.errors.nickname && (
              <p className="text-xs text-destructive">
                {form3.formState.errors.nickname.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">
              性別 <span className="text-fg-muted">（選填）</span>
            </label>
            <div className="flex gap-3">
              {[
                { value: 1, label: '男' },
                { value: 2, label: '女' },
                { value: 0, label: '其他' },
              ].map((g) => (
                <label
                  key={g.value}
                  className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-surface-secondary bg-surface-secondary px-4 py-2.5 text-sm transition-colors has-[:checked]:border-brand-purple has-[:checked]:bg-brand-purple/10"
                >
                  <input
                    type="radio"
                    value={g.value}
                    {...form3.register('gender')}
                    className="sr-only"
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">
              生日 <span className="text-fg-muted">（選填）</span>
            </label>
            <Input
              {...form3.register('birthday')}
              type="date"
              className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">
              Email <span className="text-destructive">*</span>
              <span className="text-fg-muted">（電子發票需要）</span>
            </label>
            <Input
              {...form3.register('email')}
              type="email"
              placeholder="name@example.com"
              className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
            />
            {form3.formState.errors.email && (
              <p className="text-xs text-destructive">
                {form3.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Form-level errors */}
          {form3.formState.errors.root && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {form3.formState.errors.root.message}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => setStep(2)}
              variant="outline"
              className="h-12 flex-1 rounded-xl text-base"
              size="lg"
            >
              上一步
            </Button>
            <Button
              type="submit"
              disabled={form3.formState.isSubmitting}
              className="h-12 flex-1 rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
              size="lg"
            >
              {form3.formState.isSubmitting ? '建立中...' : '完成註冊'}
            </Button>
          </div>
        </form>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-teal/20">
            <CheckCircle2 className="size-8 text-brand-teal" />
          </div>
          <div>
            <h3 className="font-heading text-2xl font-bold text-fg-primary">
              註冊完成！
            </h3>
            <p className="mt-2 text-sm text-fg-secondary">
              歡迎加入羽升幸福養成學苑，開始你的學習之旅
            </p>
          </div>
          <Link href="/dashboard">
            <Button
              className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90"
              size="lg"
            >
              開始使用
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
