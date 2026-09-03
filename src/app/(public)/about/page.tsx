import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, Target, Lightbulb, Users, Brain, MessageSquare } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '關於我們 — 羽升幸福養成學苑',
  description: '羽升幸福養成學院 — 讓每個人都能理解愛、說出愛、活出愛。',
}

const MILESTONES = [
  { year: '2023', event: '羽升幸福養成學院成立，推出 MBTI 幸福關係課程' },
  { year: '2024', event: '導入 AI ChatBot 家教系統，累積 500+ 位學員' },
  { year: '2025', event: '推出鑽石溝通術、奇門排盤課程，服務範圍擴大至海外' },
  { year: '2026', event: 'V2 平台升級，全面 AI 化學習體驗' },
]

const VALUES = [
  {
    icon: Heart,
    title: '理解愛',
    desc: '透過 MBTI 人格分析與薩提爾冰山理論，幫助你看懂自己和伴侶的深層需求。',
  },
  {
    icon: Target,
    title: '說出愛',
    desc: '學習非暴力溝通技巧，把想說的話用對方聽得懂的方式表達。',
  },
  {
    icon: Lightbulb,
    title: '活出愛',
    desc: '透過 21 天科學練習 + AI 情境演練，讓改變真正在日常生活中發生。',
  },
]

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-surface-primary px-4 py-20 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-block rounded-lg bg-brand-purple/10 px-3 py-1 text-xs font-medium text-brand-purple">
              關於我們
            </span>
            <h1 className="mt-4 font-heading text-4xl font-bold leading-tight text-fg-primary lg:text-5xl">
              讓每個人都能
              <br />
              理解愛、說出愛、活出愛
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-fg-secondary lg:text-lg">
              羽升幸福養成學苑（羽升幸福養成學院）結合現代心理學、東方智慧與 AI 技術，
              致力於幫助每一個人在親密關係、職場與家庭中，找到溝通的鑰匙，
              重建被理解和被連結的溫暖。
            </p>
          </div>
        </section>

        {/* Vision */}
        <section className="px-4 py-16 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 lg:flex-row">
            <div className="flex-1">
              <h2 className="font-heading text-3xl font-bold text-fg-primary">
                我們的願景
              </h2>
              <p className="mt-4 text-base leading-relaxed text-fg-secondary">
                幸福不是天生，而是養成。我們相信，當每個人都能理解自己與他人的需求，
                溝通就不再是衝突的開始，而是連結的起點。
              </p>
              <p className="mt-4 text-base leading-relaxed text-fg-secondary">
                透過 MBTI 人格分析讓你看見差異，透過薩提爾冰山理論讓你理解深層渴望，
                再透過 AI 家教陪你反覆練習，直到好的溝通成為你的本能。
              </p>
            </div>
            <div className="w-full max-w-sm">
              <Image
                src="/images/vision.png"
                alt="我們的願景"
                width={400}
                height={400}
                className="rounded-2xl"
              />
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-surface-primary px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center font-heading text-3xl font-bold text-fg-primary">
              核心理念
            </h2>
            <div className="mt-12 grid gap-8 lg:grid-cols-3">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-2xl bg-white p-8 text-center shadow-sm">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-brand-purple/10">
                    <v.icon className="size-7 text-brand-purple" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-fg-primary">{v.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-fg-secondary">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Teachers */}
        <section className="px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center font-heading text-3xl font-bold text-fg-primary">
              創辦團隊
            </h2>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              {/* Steve */}
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex flex-col sm:flex-row">
                  <Image
                    src="/images/teacher-steve.png"
                    alt="Steve 老師"
                    width={200}
                    height={260}
                    className="h-64 w-full object-cover sm:w-48"
                  />
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-fg-primary">Steve 老師（子奇老師）</h3>
                    <p className="mt-1 text-xs text-brand-purple">人性權威 — MBTI × 關係邏輯 × AI 情境教練</p>
                    <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
                      嬌生集團高階經理人，20+ 年消費品產業經驗。台大資工碩士、匹茲堡大學 MBA。
                      羽升幸福養成學院創辦人，研究人類決策行為超過 20 年。
                      結合現代心理學、東方智慧與 AI 技術，致力於幫助每個人理解愛的本質。
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">MBTI 認證</span>
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">薩提爾模式</span>
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">奇門遁甲</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Angel */}
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex flex-col sm:flex-row">
                  <Image
                    src="/images/teacher-angel.png"
                    alt="Angel 老師"
                    width={200}
                    height={260}
                    className="h-64 w-full object-cover sm:w-48"
                  />
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-fg-primary">Angel 老師</h3>
                    <p className="mt-1 text-xs text-brand-purple">幸福導師 — 需求傾聽 × 情緒涵容</p>
                    <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
                      30+ 年專業經歷，曾擔任國際 NGO 台灣區執行長 7 年。
                      擅長以 MBTI 與薩提爾方法，用溫暖的陪伴引導學員表達真實感受，
                      走過關係難題，重新找回愛與幸福的力量。
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">公關傳播</span>
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">組織管理</span>
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs text-fg-secondary">情緒教練</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Milestones */}
        <section className="bg-surface-primary px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center font-heading text-3xl font-bold text-fg-primary">
              發展歷程
            </h2>
            <div className="mt-12 space-y-6">
              {MILESTONES.map((m) => (
                <div key={m.year} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-brand-purple text-sm font-bold text-white">
                      {m.year.slice(2)}
                    </div>
                    <div className="mt-2 h-full w-px bg-surface-secondary" />
                  </div>
                  <div className="pb-6">
                    <p className="text-sm font-semibold text-fg-primary">{m.year}</p>
                    <p className="mt-1 text-sm text-fg-secondary">{m.event}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-heading text-3xl font-bold text-fg-primary">
              加入我們，開始你的幸福之旅
            </h2>
            <p className="mt-4 text-base text-fg-secondary">
              無論你是想改善親密關係、職場溝通，還是親子互動，
              我們都能陪你找到屬於自己的幸福方程式。
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/register">
                <Button className="h-12 rounded-xl bg-brand-purple px-8 text-base font-medium text-white hover:bg-brand-purple/90">
                  免費註冊
                </Button>
              </Link>
              <Link href="/#courses">
                <Button variant="outline" className="h-12 rounded-xl px-8 text-base font-medium">
                  瀏覽課程
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
