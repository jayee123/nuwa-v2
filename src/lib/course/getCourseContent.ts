import fs from 'fs'
import path from 'path'

type RelationshipType = 'couple' | 'parent_child' | 'workplace'

export interface DayContent {
  day: number
  title: string
  theme: string
  objectives: string[]
  actions: string[]
  reflectionQuestions: string[]
  coreTip: string
  variationTip?: string
  mbtiCognitiveFunctions?: Record<string, {
    name: string
    dialogue: string
    trait: string
    howToUnderstand: string
  }>
}

interface CourseContent {
  version: string
  name: string
  description: string
  defaultRelationshipType: RelationshipType
  days: (DayContent & { variation?: Record<RelationshipType, string> })[]
}

let cachedContent: CourseContent | null = null

function loadCourseContent(): CourseContent {
  if (cachedContent) return cachedContent
  const contentPath = path.join(process.cwd(), 'data', 'courseContent.json')
  const raw = fs.readFileSync(contentPath, { encoding: 'utf-8' })
  cachedContent = JSON.parse(raw) as CourseContent
  return cachedContent
}

export function getCourseDay(relationshipType: RelationshipType, day: number): DayContent | null {
  const course = loadCourseContent()
  const found = course.days.find((item) => item.day === day)
  if (!found) return null

  const variationTip = found.variation?.[relationshipType] ?? found.variation?.[course.defaultRelationshipType]

  return {
    day: found.day,
    title: found.title,
    theme: found.theme,
    objectives: found.objectives,
    actions: found.actions,
    reflectionQuestions: found.reflectionQuestions,
    coreTip: found.coreTip,
    variationTip: variationTip ?? undefined,
    mbtiCognitiveFunctions: found.mbtiCognitiveFunctions,
  }
}

export function getCourseMeta() {
  const course = loadCourseContent()
  return {
    version: course.version,
    name: course.name,
    totalDays: course.days.length,
  }
}
