import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RegisterForm } from '@/components/auth/register-form'
import { Logo } from '@/components/ui/logo'

export const metadata: Metadata = {
  title: '註冊 — 羽升幸福養成學苑',
  description: '註冊帳號，開始你的學習之旅',
}

export default function RegisterPage() {
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
            加入我們
            <br />
            開始你的學習之旅
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base leading-relaxed text-white/80">
            註冊即可免費體驗 AI 家教對話，
            <br />
            探索適合你的學習方案。
          </p>
        </div>
      </div>

      {/* Right — Register Form */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          <Suspense>
            <RegisterForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
