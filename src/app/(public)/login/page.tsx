import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'
import { Logo } from '@/components/ui/logo'

export const metadata: Metadata = {
  title: '登入 — 羽升幸福養成學苑',
  description: '登入你的帳號以繼續學習',
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left — Brand Visual */}
      <div className="hidden flex-col justify-center bg-brand-purple px-12 lg:flex lg:w-1/2 xl:px-20">
        <div className="max-w-md">
          {/* Logo */}
          <div className="mb-10">
            <Logo variant="white" href="/" />
          </div>

          {/* Heading */}
          <h1 className="font-heading text-4xl leading-tight text-white xl:text-5xl">
            用 AI 陪你走進
            <br />
            真正的幸福關係
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base leading-relaxed text-white/80">
            結合 MBTI 人格分析與薩提爾冰山理論，
            <br />
            陪你每天練習，把溝通變成本能。
          </p>
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          <h2 className="font-heading text-3xl font-bold text-fg-primary">
            歡迎回來
          </h2>
          <p className="mt-2 text-base text-fg-secondary">
            登入你的帳號以繼續學習
          </p>

          <div className="mt-8">
            {/* LoginForm 用 useSearchParams 讀 ?next=，需要 Suspense 邊界才能靜態預渲染 */}
            <Suspense fallback={<div className="h-64" />}>
              <LoginForm />
            </Suspense>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/guest/happy"
              className="text-sm text-accent-primary hover:underline"
            >
              不想註冊？免費體驗看看
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
