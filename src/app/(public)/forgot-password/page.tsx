import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { Logo } from '@/components/ui/logo'

export const metadata: Metadata = {
  title: '忘記密碼 — 羽升幸福養成學苑',
  description: '透過手機驗證重設您的密碼',
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left — Brand Visual */}
      <div className="hidden flex-col justify-center bg-brand-purple px-12 lg:flex lg:w-1/2 xl:px-20">
        <div className="max-w-md">
          <div className="mb-10">
            <Logo variant="white" href="/" />
          </div>

          <h1 className="font-heading text-4xl leading-tight text-white xl:text-5xl">
            重設你的密碼
          </h1>

          <p className="mt-6 text-base leading-relaxed text-white/80">
            透過手機驗證碼，安全地重設你的登入密碼。
          </p>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  )
}
