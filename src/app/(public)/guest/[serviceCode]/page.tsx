import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServiceByCode } from '@/lib/queries/services'
import { LearningDashboard } from '@/components/dashboard/learning-dashboard'

export const metadata: Metadata = {
  title: '免費體驗 — 羽升幸福養成學苑',
  description: '免費體驗 AI 家教課程',
}

export default async function GuestPage({
  params,
}: {
  params: Promise<{ serviceCode: string }>
}) {
  const { serviceCode } = await params
  const data = await getServiceByCode(serviceCode)

  if (!data) notFound()

  const { service, teacher, chapters } = data

  const sidebarChapters = chapters.map((ch, ci) => ({
    id: `ch-${ci}`,
    title: ch.title,
    units: ch.units.map((u, ui) => ({
      id: u.id ?? `u-${ci}-${ui}`,
      title: u.title,
      content_url: u.content_url ?? null,
      completed: false,
    })),
  }))

  const allUnits = sidebarChapters.flatMap((ch) => ch.units)
  const firstUnitId = allUnits[0]?.id ?? null

  return (
    <LearningDashboard
      serviceName={service.name}
      serviceId={service.id}
      serviceCode={serviceCode}
      teacherId={teacher?.id ?? null}
      chapters={sidebarChapters}
      units={allUnits}
      initialUnitId={firstUnitId}
      dialogLimit={0}
      readonly
    />
  )
}
