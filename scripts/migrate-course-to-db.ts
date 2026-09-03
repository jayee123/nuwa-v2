/**
 * One-time migration: courseContent.json → course_templates + course_days tables
 * Usage: npx tsx scripts/migrate-course-to-db.ts
 */

import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Try loading from .env.local
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const [key, ...valueParts] = line.split('=')
      const value = valueParts.join('=').trim()
      if (key?.trim() && value) {
        process.env[key.trim()] = value
      }
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function supabasePost(table: string, data: Record<string, unknown> | Record<string, unknown>[]) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`POST ${table} failed: ${res.status} ${err}`)
  }
  return res.json()
}

async function main() {
  // 1. Read courseContent.json
  const contentPath = path.join(process.cwd(), 'data', 'courseContent.json')
  const raw = fs.readFileSync(contentPath, 'utf-8')
  const course = JSON.parse(raw)

  console.log(`Read ${course.days.length} days from courseContent.json`)

  // 2. Create course template
  const [template] = await supabasePost('course_templates', {
    code: 'happy_v1',
    name: course.name,
    description: course.description,
    total_days: course.days.length,
    is_active: true,
  })

  console.log(`Created template: ${template.id} (${template.code})`)

  // 3. Map and insert course days
  const days = course.days.map((day: Record<string, unknown>) => ({
    template_id: template.id,
    day_number: day.day,
    title: day.title,
    theme: day.theme,
    core_tip: day.coreTip,
    objectives: day.objectives || [],
    actions: day.actions || [],
    reflection_questions: day.reflectionQuestions || [],
    evening_questions: [],
    mbti_cognitive_fns: day.mbtiCognitiveFunctions || null,
    variation_couple: (day.variation as Record<string, string>)?.couple || null,
    variation_parent: (day.variation as Record<string, string>)?.parent_child || null,
    variation_workplace: (day.variation as Record<string, string>)?.workplace || null,
    sort_order: day.day,
  }))

  const inserted = await supabasePost('course_days', days)
  console.log(`Inserted ${inserted.length} course days`)

  console.log('\nMigration complete!')
  console.log(`Template: ${template.code} (${template.id})`)
  console.log(`Days: ${inserted.length}`)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
