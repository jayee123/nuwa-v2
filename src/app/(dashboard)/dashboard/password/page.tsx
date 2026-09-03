import type { Metadata } from 'next'
import { ChangePasswordForm } from '@/components/auth/change-password-form'

export const metadata: Metadata = {
  title: '密碼重設 — 羽升幸福養成學苑',
  description: '變更你的登入密碼',
}

export default function PasswordPage() {
  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="font-heading text-2xl font-bold text-fg-primary">
            密碼重設
          </h1>
          <p className="mt-2 text-sm text-fg-secondary">
            請輸入目前的密碼與新密碼
          </p>

          <div className="mt-8 max-w-md">
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  )
}
