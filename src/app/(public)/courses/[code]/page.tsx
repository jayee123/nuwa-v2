import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, MessageSquare, FileText, Video, Star, ChevronRight } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CourseAccordion } from '@/components/course/course-accordion'
import { PlanSelector } from '@/components/course/plan-selector'
import { getServiceByCode } from '@/lib/queries/services'

// Static data not yet in DB
const STATIC_EXTRAS = {
  features: [
    'AI 家教 24 小時陪練對話',
    'MBTI 個人化分析報告',
    '21 天科學練習計畫',
    '專業講師影片課程',
  ],
  reviews: [
    {
      name: '小美',
      content:
        '上完課後真的更了解另一半的想法了！AI 家教的對話練習很實用，每天花 10 分鐘就能進步。',
    },
    {
      name: 'James',
      content:
        '21 天科學練習讓我養成了每天反思溝通的習慣，跟伴侶的衝突明顯減少了。推薦給所有想改善關係的人！',
    },
  ],
  faq: [
    {
      question: '課程可以重複觀看嗎？',
      answer:
        '可以！訂閱期間內所有影片課程皆可無限次觀看。AI 家教對話依你的方案點數計算。',
    },
    {
      question: '可以隨時取消訂閱嗎？',
      answer:
        '可以隨時取消，取消後仍可使用至當期結束。詳細退費政策請參考付費說明頁面。',
    },
  ],
  rating: 4.9,
  reviewCount: 128,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const data = await getServiceByCode(code)
  if (!data) return { title: '課程不存在 — 羽升幸福養成學苑' }
  return {
    title: `${data.service.name} — 羽升幸福養成學苑`,
    description: data.service.description ?? '',
  }
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const data = await getServiceByCode(code)

  if (!data) notFound()

  const { service, teacher, chapters, plans } = data
  const totalUnits = chapters.reduce((sum, ch) => sum + ch.units.length, 0)
  const accordionChapters = chapters.map((ch) => ({
    title: ch.title,
    duration: `${ch.units.length} 小節`,
    units: ch.units.map((u) => ({ title: u.title, duration: '' })),
  }))

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Back link */}
        <div className="mx-auto max-w-7xl px-4 pt-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg-primary"
          >
            <ArrowLeft className="size-4" />
            回到課程列表
          </Link>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 lg:flex lg:gap-10 lg:px-8">
          {/* Left content */}
          <div className="min-w-0 flex-1">
            {/* Hero */}
            <div className="overflow-hidden rounded-2xl bg-surface-secondary">
              <div className="relative aspect-[16/9] bg-brand-rose/20">
                {/* Placeholder — replace with real banner */}
                <div className="flex h-full items-center justify-center text-6xl">
                  📖
                </div>
              </div>
              <div className="p-6 lg:p-8">
                <h1 className="font-heading text-3xl font-bold text-fg-primary lg:text-4xl">
                  {service.name}
                </h1>
                <p className="mt-4 text-base leading-relaxed text-fg-secondary">
                  {service.description}
                </p>
                {/* Features */}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {STATIC_EXTRAS.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm text-fg-secondary">
                      {f.includes('AI') ? (
                        <MessageSquare className="size-4 text-brand-purple" />
                      ) : f.includes('影片') ? (
                        <Video className="size-4 text-brand-purple" />
                      ) : f.includes('報告') ? (
                        <FileText className="size-4 text-brand-purple" />
                      ) : (
                        <Clock className="size-4 text-brand-purple" />
                      )}
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Teacher */}
            {teacher && (
              <section className="mt-10">
                <div className="flex items-start gap-4">
                  <div className="size-14 shrink-0 rounded-full bg-brand-purple/20" />
                  <div>
                    <h3 className="text-lg font-semibold text-fg-primary">
                      {teacher.name}
                    </h3>
                    {teacher.system_prompt && (
                      <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
                        {teacher.system_prompt}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Curriculum */}
            {accordionChapters.length > 0 && (
              <section className="mt-10">
                <h2 className="font-heading text-xl font-bold text-fg-primary">
                  課程大綱
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
                  {chapters.length} 章 · {totalUnits} 小節
                </p>
                <div className="mt-4">
                  <CourseAccordion chapters={accordionChapters} />
                </div>
              </section>
            )}

            {/* Reviews */}
            <section className="mt-10">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-fg-primary">
                  學員評價
                </h2>
                <div className="flex items-center gap-1 text-sm text-fg-secondary">
                  <Star className="size-4 fill-brand-orange text-brand-orange" />
                  {STATIC_EXTRAS.rating} / 5.0
                  <span className="text-fg-muted">
                    ({STATIC_EXTRAS.reviewCount} 則評價)
                  </span>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                {STATIC_EXTRAS.reviews.map((review) => (
                  <div
                    key={review.name}
                    className="rounded-xl border border-surface-secondary bg-white p-5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-full bg-brand-rose/30" />
                      <span className="font-medium text-fg-primary">
                        {review.name}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
                      {review.content}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQ */}
            <section className="mt-10 mb-16">
              <h2 className="font-heading text-xl font-bold text-fg-primary">
                常見問題
              </h2>
              <div className="mt-4 space-y-3">
                {STATIC_EXTRAS.faq.map((item) => (
                  <details
                    key={item.question}
                    className="group rounded-xl border border-surface-secondary bg-white"
                  >
                    <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-fg-primary">
                      {item.question}
                      <ChevronRight className="size-4 text-fg-muted transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="px-5 pb-4 text-sm leading-relaxed text-fg-secondary">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {/* Right sidebar — Plan selector (sticky) */}
          <div className="hidden lg:block lg:w-80">
            <div className="sticky top-24">
              <PlanSelector plans={plans} courseCode={code} />
            </div>
          </div>
        </div>

        {/* Mobile fixed CTA */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-secondary bg-white p-4 lg:hidden">
          <Link href={`/dashboard/subscribe/${code}`}>
            <Button className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90">
              確認報名並付款
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  )
}
