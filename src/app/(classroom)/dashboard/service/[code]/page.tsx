import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServiceByCode } from '@/lib/queries/services'
import { LearningDashboard } from '@/components/dashboard/learning-dashboard'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const data = await getServiceByCode(code)
  if (!data) return { title: '課程不存在' }
  return { title: `${data.service.name} — 羽升幸福養成學苑` }
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const data = await getServiceByCode(code)

  if (!data) notFound()

  const { service, teacher, chapters } = data

  // Build chapter/unit structure for the sidebar
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
      serviceCode={code}
      teacherId={teacher?.id ?? null}
      chapters={sidebarChapters}
      units={allUnits}
      initialUnitId={firstUnitId}
      dialogLimit={48}
    />
  )
}
