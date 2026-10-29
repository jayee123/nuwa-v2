import { createClient } from '@/lib/supabase/server'

export interface ServiceWithTeacher {
  id: string
  code: string
  name: string
  description: string | null
  banner_url: string | null
  plans: { name: string; price: number; period: string; features: string[]; recommended?: boolean }[]
  sort_order: number
  teacher_name: string | null
  teacher_avatar: string | null
}

export async function getActiveServices(): Promise<ServiceWithTeacher[]> {
  const supabase = await createClient()

  // 課程和老師同時查（老師不再等課程 id）：少一趟資料庫往返，首頁和 /courses 都用這支。
  // 老師表很小，全撈有效的再用 service_id 對；對不到的（停用課程的老師）用不到。
  const [{ data: services }, { data: teachers }] = await Promise.all([
    supabase
      .from('services')
      .select('id, code, name, description, banner_url, plans, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('teachers').select('service_id, name, avatar_url').eq('is_active', true),
  ])

  if (!services) return []

  const teacherMap = new Map(
    (teachers ?? []).map((t) => [t.service_id, t])
  )

  return services.map((s) => {
    const teacher = teacherMap.get(s.id)
    return {
      ...s,
      plans: (typeof s.plans === 'string' ? JSON.parse(s.plans) : s.plans ?? []) as ServiceWithTeacher['plans'],
      teacher_name: teacher?.name ?? null,
      teacher_avatar: teacher?.avatar_url ?? null,
    }
  })
}

export async function getServiceByCode(code: string) {
  const supabase = await createClient()

  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('code', code)
    .single()

  if (!service) return null

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('service_id', service.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  // Get course curriculum
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, description, sort_order')
    .eq('service_id', service.id)
    .order('sort_order')

  let chapters: { title: string; units: { id: string; title: string; content_url: string | null }[] }[] = []

  if (courses && courses.length > 0) {
    const courseId = courses[0].id

    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, title, sort_order')
      .eq('course_id', courseId)
      .order('sort_order')

    if (subjects) {
      const subjectIds = subjects.map((s) => s.id)
      const { data: units } = await supabase
        .from('units')
        .select('id, subject_id, title, content_url, sort_order')
        .in('subject_id', subjectIds)
        .order('sort_order')

      const unitMap = new Map<string, { id: string; title: string; content_url: string | null }[]>()
      for (const u of units ?? []) {
        const arr = unitMap.get(u.subject_id) ?? []
        arr.push({ id: u.id, title: u.title, content_url: u.content_url })
        unitMap.set(u.subject_id, arr)
      }

      chapters = subjects.map((s) => ({
        title: s.title,
        units: unitMap.get(s.id) ?? [],
      }))
    }
  }

  return {
    service,
    teacher,
    chapters,
    plans: (typeof service.plans === 'string' ? JSON.parse(service.plans) : service.plans ?? []) as ServiceWithTeacher['plans'],
  }
}
