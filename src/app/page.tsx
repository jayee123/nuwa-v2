export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { MessageSquare, Brain, Users, Clock, Star } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { AdminBanner } from '@/components/layout/admin-banner'
import { Button } from '@/components/ui/button'
import { getActiveServices } from '@/lib/queries/services'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const FEATURES = [
  {
    icon: Brain,
    title: '幸福關係的底層邏輯',
    desc: '結合 MBTI 人格分析 × 薩提爾冰山理論，看懂需求與渴望，走進真正的幸福關係。',
  },
  {
    icon: MessageSquare,
    title: 'AI ChatBot 專屬陪伴',
    desc: '24 小時 AI 家教隨時陪你練習對話情境，把學過的東西真正用起來。',
  },
  {
    icon: Users,
    title: '專業師資團隊',
    desc: '結合心理諮商、MBTI 認證分析、20 年企業管理經驗的跨領域教學團隊。',
  },
  {
    icon: Clock,
    title: '21 天科學練習',
    desc: '每天 10 分鐘，搭配 AI 情境演練，養成溝通好習慣，讓改變真正發生。',
  },
]

const TESTIMONIALS = [
  { name: 'Renee', content: '我終於知道他需要的是什麼，爭吵變少了。', rating: 5 },
  { name: 'Alex', content: '有 AI 陪練，我第一次把學過的東西真的用起來。', rating: 5 },
  { name: 'Tom', content: '我們找到了彼此都能接受的節奏。', rating: 5 },
]

const TEACHERS = [
  {
    name: 'Steve 老師（子奇老師）',
    title: '人性權威 — MBTI × 關係邏輯 × AI 情境教練',
    bio: '嬌生集團高階經理人，20 年消費品產業經驗，台大資工碩士、匹茲堡大學 MBA。羽升幸福養成學院創辦人，結合現代心理學、東方智慧與 AI 技術。',
    image: '/images/teacher-steve.png',
  },
  {
    name: 'Angel 老師',
    title: '幸福導師 — 需求傾聽 × 情緒涵容',
    bio: '30 年專業經歷，7 年國際 NGO 幫助重症兒童。擅長以 MBTI 與薩提爾方法，陪伴學員走過關係難題，重新找回愛與幸福的力量。',
    image: '/images/teacher-angel.png',
  },
]

async function getActiveAppSlugs(): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin.from('apps').select('slug').eq('status', 'active')
  return new Set((data ?? []).map((a) => a.slug as string))
}

// 登入會員「已進過哪些 App」（user_apps 綁定）→ 判斷首次 vs 回訪（每會員一次）
async function getLaunchedSlugs(): Promise<{ loggedIn: boolean; launched: Set<string> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { loggedIn: false, launched: new Set() }
  const admin = createAdminClient()
  const { data: bindings } = await admin.from('user_apps').select('app_id').eq('user_id', user.id)
  const ids = (bindings ?? []).map((b) => b.app_id as string)
  if (ids.length === 0) return { loggedIn: true, launched: new Set() }
  const { data: appsRows } = await admin.from('apps').select('slug').in('id', ids)
  return { loggedIn: true, launched: new Set((appsRows ?? []).map((a) => a.slug as string)) }
}

export default async function HomePage() {
  const services = await getActiveServices()
  const appSlugs = await getActiveAppSlugs()
  const { loggedIn, launched } = await getLaunchedSlugs()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <AdminBanner />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-surface-primary px-4 py-16 lg:px-8 lg:py-24">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 lg:flex-row">
            <div className="flex-1">
              <span className="inline-block rounded-lg bg-brand-purple/10 px-3 py-1 text-xs font-medium text-brand-purple">
                羽升幸福養成學院
              </span>
              <h1 className="mt-4 font-heading text-4xl font-bold leading-tight text-fg-primary lg:text-5xl">
                看懂需求與渴望
                <br />
                走進真正的幸福關係
              </h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-fg-secondary lg:text-lg">
                幸福關係的底層邏輯 × MBTI 薩提爾冰山深度解析 × AI ChatBot 專屬陪伴。
                讓每個人都能理解愛、說出愛、活出愛。
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/guest/happy">
                  <Button className="h-12 rounded-xl bg-brand-purple px-8 text-base font-medium text-white hover:bg-brand-purple/90">
                    免費體驗 AI 家教
                  </Button>
                </Link>
                <Link href="#courses">
                  <Button variant="outline" className="h-12 rounded-xl px-8 text-base font-medium">
                    看課程內容
                  </Button>
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap gap-8">
                <div className="text-sm text-fg-secondary">
                  <span className="text-xl font-bold text-fg-primary">500+</span> 位學員
                </div>
                <div className="text-sm text-fg-secondary">
                  <span className="text-xl font-bold text-fg-primary">98%</span> 滿意度
                </div>
                <div className="text-sm text-fg-secondary">
                  <span className="text-xl font-bold text-fg-primary">24hr</span> AI 陪練
                </div>
              </div>
            </div>

            {/* Hero image */}
            <div className="relative w-full max-w-md lg:max-w-lg">
              <Image
                src="/images/hero.png"
                alt="幸福關係學"
                width={600}
                height={500}
                className="rounded-2xl"
                priority
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center font-heading text-3xl font-bold text-fg-primary">
              為什麼選擇羽升幸福養成學苑
            </h2>
            <p className="mt-3 text-center text-base text-fg-secondary">
              結合心理學理論、AI 技術與實戰練習的全方位學習體驗
            </p>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-brand-purple/10">
                    <f.icon className="size-6 text-brand-purple" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg-primary">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 所有 App */}
        <section id="courses" className="bg-surface-primary px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-2xl font-bold text-fg-primary">所有 App</h2>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((svc) => {
                const isActiveApp = appSlugs.has(svc.code)
                return (
                  <div
                    key={svc.code}
                    className="flex h-full flex-col overflow-hidden rounded-2xl border border-surface-secondary bg-white shadow-sm"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-surface-secondary">
                      {svc.banner_url ? (
                        <Image src={svc.banner_url} alt={svc.name} fill className="object-cover" />
                      ) : null}
                      {!isActiveApp && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <span className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-fg-primary">
                            敬請期待
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="font-heading text-lg font-bold text-fg-primary">{svc.name}</h3>
                      <p className="mt-1 flex-1 text-sm text-fg-secondary">{svc.description ?? ''}</p>
                      {isActiveApp ? (
                        <>
                          {loggedIn && launched.has(svc.code) ? (
                            // 回訪：兩顆按鈕
                            <div className="mt-4 flex gap-2">
                              <a
                                href={`/api/apps/${svc.code}/launch?to=app`}
                                className="inline-flex flex-1 items-center justify-center rounded-xl bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                              >
                                直接進入 App
                              </a>
                              <a
                                href={`/api/apps/${svc.code}/launch?to=welcome`}
                                className="inline-flex flex-1 items-center justify-center rounded-xl border border-brand-purple/40 px-4 py-2.5 text-sm font-medium text-brand-purple transition-colors hover:bg-brand-purple/10"
                              >
                                看導覽
                              </a>
                            </div>
                          ) : (
                            // 首次（或未登入）：一顆，先看導覽
                            <a
                              href={`/api/apps/${svc.code}/launch?to=welcome`}
                              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                            >
                              進去使用 App
                            </a>
                          )}
                          <p className="mt-2 text-center text-xs text-fg-muted">綁卡即享 7 天免費試用，之後自動扣款</p>
                        </>
                      ) : (
                        <button
                          disabled
                          className="mt-4 inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-surface-secondary px-4 py-2.5 text-sm font-medium text-fg-muted"
                        >
                          敬請期待
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Teachers */}
        <section className="px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center font-heading text-3xl font-bold text-fg-primary">
              專業師資團隊
            </h2>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              {TEACHERS.map((t) => (
                <div key={t.name} className="flex gap-6 rounded-2xl bg-white p-6 shadow-sm">
                  <Image
                    src={t.image}
                    alt={t.name}
                    width={120}
                    height={120}
                    className="size-28 shrink-0 rounded-xl object-cover"
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-fg-primary">{t.name}</h3>
                    <p className="mt-1 text-xs text-brand-purple">{t.title}</p>
                    <p className="mt-3 text-sm leading-relaxed text-fg-secondary">{t.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-surface-primary px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center font-heading text-3xl font-bold text-fg-primary">
              學員真實回饋
            </h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex gap-1">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="size-4 fill-brand-orange text-brand-orange" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-fg-secondary">「{t.content}」</p>
                  <p className="mt-4 text-sm font-medium text-fg-primary">— {t.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Image
              src="/images/cta-footer.png"
              alt="開始學習"
              width={200}
              height={200}
              className="mx-auto mb-8"
            />
            <h2 className="font-heading text-3xl font-bold text-fg-primary">
              準備好開始你的幸福之旅了嗎？
            </h2>
            <p className="mt-4 text-base text-fg-secondary">
              註冊即可免費體驗 AI 家教對話，探索適合你的學習方案。
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/register">
                <Button className="h-12 rounded-xl bg-brand-purple px-8 text-base font-medium text-white hover:bg-brand-purple/90">
                  立即註冊
                </Button>
              </Link>
              <Link href="/dashboard/subscribe/happy">
                <Button variant="outline" className="h-12 rounded-xl px-8 text-base font-medium">
                  查看方案
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
