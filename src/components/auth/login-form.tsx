'use client'

import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CountryCodeSelect } from '@/components/ui/country-code-select'
import { login, loginWithEmail, loginWithOtp } from '@/app/(public)/login/actions'
import { isValidPhone } from '@/lib/phone'

type LoginMode = 'phone' | 'email'

const loginSchema = z.object({
  phone: z
    .string()
    .min(1, '請輸入手機號碼')
    .refine(isValidPhone, '請輸入有效的手機號碼'),
  password: z
    .string()
    .min(1, '請輸入密碼')
    .min(6, '密碼至少 6 個字元'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginForm() {
  // 從 /login?next=… 帶回登入後要去的地方（例如 SSO launch 會帶 /api/apps/:slug/launch）
  // 值的安全性由 server action 的 safeNext() 把關，這裡只負責轉交
  const next = useSearchParams().get('next') ?? undefined

  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [countryCode, setCountryCode] = useState('+886')

  // 登入模式：手機 / Email 切換
  const [mode, setMode] = useState<LoginMode>('phone')
  const [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)

  // OTP state for superadmin
  const [otpStep, setOtpStep] = useState(false)
  const [otpPhone, setOtpPhone] = useState('')
  const [otpEmail, setOtpEmail] = useState<string | undefined>(undefined)
  const [otpCode, setOtpCode] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const passwordRef = useRef('')

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  })

  // 手機模式的 <form>，syncAutofilledValues() 要靠它讀 DOM 的真實值
  const phoneFormRef = useRef<HTMLFormElement>(null)

  /**
   * 把瀏覽器自動填入的值同步回 react-hook-form。
   *
   * ⚠️ 為什麼需要這一步：register() 是 uncontrolled，RHF 的值存在自己的
   * _formValues 裡、靠 change 事件更新。但 Chrome 用存好的密碼自動填入時
   * 不一定會送出 React 收得到的事件 —— 尤其是在 hydration 之前就填好的情況。
   * 結果是畫面上明明有值，RHF 內部卻還是空字串，送出時被 zod 的
   * 「密碼至少 6 個字元」擋下，使用者只會以為密碼記錯了。
   *
   * 所以送出前先拿 DOM 的真實值覆蓋回表單狀態，再交給 handleSubmit 驗證。
   */
  function syncAutofilledValues() {
    const form = phoneFormRef.current
    if (!form) return
    for (const name of ['phone', 'password'] as const) {
      const el = form.elements.namedItem(name)
      if (el instanceof HTMLInputElement && el.value !== getValues(name)) {
        setValue(name, el.value, { shouldValidate: false })
      }
    }
  }

  function onPhoneSubmit(e: FormEvent<HTMLFormElement>) {
    syncAutofilledValues()
    return handleSubmit(onSubmit)(e)
  }

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function onSubmit(data: LoginFormValues) {
    setServerError(null)
    const result = await login({ ...data, countryCode, next })
    if (result?.requireOtp) {
      // Superadmin — switch to OTP step（手機模式：用 phone 完成登入）
      passwordRef.current = data.password
      setOtpPhone(result.phone)
      setOtpEmail(undefined)
      setOtpStep(true)
      setCooldown(60)
      return
    }
    if (result?.error) {
      if (result.error.includes('Invalid login credentials')) {
        setServerError('手機號碼或密碼錯誤')
      } else {
        setServerError(result.error)
      }
    }
  }

  async function handleOtpSubmit() {
    setServerError(null)
    setOtpSubmitting(true)
    try {
      const result = await loginWithOtp({
        phone: otpPhone,
        password: passwordRef.current,
        otp: otpCode,
        email: otpEmail,
        next,
      })
      if (result?.error) {
        setServerError(result.error)
      }
    } catch {
      setServerError('網路錯誤，請稍後再試')
    } finally {
      setOtpSubmitting(false)
    }
  }

  async function handleResendOtp() {
    setServerError(null)
    setCooldown(60)
    const values = getValues()
    await login({ ...values, countryCode, next })
  }

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    if (!email.trim() || !email.includes('@')) {
      setServerError('請輸入有效的 Email')
      return
    }
    if (emailPassword.length < 6) {
      setServerError('密碼至少 6 個字元')
      return
    }
    setEmailSubmitting(true)
    try {
      const result = await loginWithEmail({ email: email.trim(), password: emailPassword, next })
      if (result?.requireOtp) {
        // superadmin — 切到 OTP 步驟（OTP 仍發到手機，但最後用 email 完成登入）
        passwordRef.current = emailPassword
        setOtpPhone(result.phone)
        setOtpEmail(email.trim())
        setOtpStep(true)
        setCooldown(60)
        return
      }
      if (result?.error) {
        setServerError(
          result.error.includes('Invalid login credentials')
            ? 'Email 或密碼錯誤'
            : result.error
        )
      }
    } catch {
      setServerError('網路錯誤，請稍後再試')
    } finally {
      setEmailSubmitting(false)
    }
  }

  // --- OTP verification step (superadmin only) ---
  if (otpStep) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-purple/10">
            <ShieldCheck className="size-6 text-brand-purple" />
          </div>
          <h3 className="text-lg font-semibold text-fg-primary">管理員身分驗證</h3>
          <p className="text-center text-sm text-fg-muted">
            已發送驗證碼至您的手機，請輸入 4 位數驗證碼
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-fg-primary">驗證碼</label>
          <Input
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            type="text"
            inputMode="numeric"
            placeholder="1234"
            maxLength={4}
            className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-center text-lg tracking-[0.5em] placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
            autoFocus
          />
        </div>

        {serverError && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <Button
          onClick={handleOtpSubmit}
          disabled={otpSubmitting || otpCode.length !== 4}
          className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
          size="lg"
        >
          {otpSubmitting ? '驗證中...' : '驗證登入'}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setOtpStep(false)
              setOtpCode('')
              setServerError(null)
            }}
            className="text-fg-muted hover:text-fg-primary"
          >
            返回登入
          </button>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={cooldown > 0}
            className="text-accent-primary hover:underline disabled:text-fg-muted"
          >
            {cooldown > 0 ? `重新發送 (${cooldown}s)` : '重新發送驗證碼'}
          </button>
        </div>
      </div>
    )
  }

  // --- Normal login form ---
  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
    >
      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* 模式切換：手機 / Email */}
      <div className="flex gap-1 rounded-xl bg-surface-secondary p-1">
        {(['phone', 'email'] as LoginMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setServerError(null) }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-white text-fg-primary shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {m === 'phone' ? '手機登入' : 'Email 登入'}
          </button>
        ))}
      </div>

      {/* 兩個分支都是 <form>、位置相同，沒有 key 的話 React 會重用同一批 DOM 節點。
          而手機模式的 Input 是 uncontrolled（register），Email 模式是 controlled
          （value=…）—— 同一個 FieldControl 實例在兩者之間切換會噴 Base UI 的
          uncontrolled→controlled 警告，前一個模式的值也會殘留在節點上。 */}
      {mode === 'phone' ? (
        <form key="phone" ref={phoneFormRef} onSubmit={onPhoneSubmit} className="space-y-6">
          {/* Phone */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">手機號碼</label>
            <div className="flex gap-2">
              <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
              <Input
                {...register('phone')}
                type="tel"
                autoComplete="tel-national"
                placeholder="912 345 678"
                className="h-11 flex-1 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">密碼</label>
            <div className="relative">
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-11 rounded-xl border-surface-secondary bg-surface-secondary pr-10 text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
              />
              {passwordToggle}
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm text-accent-primary hover:underline">
              忘記密碼？
            </Link>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
            size="lg"
          >
            {isSubmitting ? '登入中...' : '登入'}
          </Button>
        </form>
      ) : (
        <form key="email" onSubmit={onEmailSubmit} className="space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-fg-primary">密碼</label>
            <div className="relative">
              <Input
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-11 rounded-xl border-surface-secondary bg-surface-secondary pr-10 text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30"
              />
              {passwordToggle}
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm text-accent-primary hover:underline">
              忘記密碼？
            </Link>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={emailSubmitting}
            className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
            size="lg"
          >
            {emailSubmitting ? '登入中...' : '登入'}
          </Button>
        </form>
      )}

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-surface-secondary" />
        <span className="text-sm text-fg-muted">或</span>
        <div className="h-px flex-1 bg-surface-secondary" />
      </div>

      {/* Register link */}
      <p className="text-center text-sm text-fg-secondary">
        還沒有帳號？{' '}
        <Link
          href="/register"
          className="font-medium text-fg-primary underline underline-offset-4 hover:text-accent-primary"
        >
          前往註冊
        </Link>
      </p>
    </div>
  )
}
