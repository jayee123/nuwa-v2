#!/usr/bin/env node

/**
 * Dedup Migration — 移除遷移腳本重複跑造成的重複資料
 *
 * 邏輯：按 name (或等效 business key) 分組，保留最早 created_at 的那筆，刪除其餘
 *
 * Usage:
 *   node job/dedup_migration.mjs              # dry-run (預設)
 *   node job/dedup_migration.mjs --execute    # 實際刪除
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const EXECUTE = process.argv.includes('--execute')

function log(msg) {
  console.log(`[DEDUP] ${msg}`)
}

/**
 * Generic dedup: fetch all rows, group by businessKey, keep earliest, delete rest
 */
async function dedupTable(table, businessKeyFn, label, orderBy = 'created_at') {
  log(`--- ${label} (${table}) ---`)

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order(orderBy, { ascending: true })

  if (error) {
    log(`  ERROR fetching: ${error.message}`)
    return 0
  }

  // Group by business key
  const groups = new Map()
  for (const row of data) {
    const key = businessKeyFn(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const toDelete = []
  for (const [key, rows] of groups) {
    if (rows.length > 1) {
      // Keep first (earliest created_at), delete rest
      const dupes = rows.slice(1)
      log(`  "${key}" — 保留 ${rows[0].id}, 刪除 ${dupes.length} 筆重複`)
      toDelete.push(...dupes.map((r) => r.id))
    }
  }

  if (toDelete.length === 0) {
    log(`  無重複`)
    return 0
  }

  if (EXECUTE) {
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .in('id', toDelete)
    if (delErr) {
      log(`  ERROR deleting: ${delErr.message}`)
    } else {
      log(`  ✅ 已刪除 ${toDelete.length} 筆`)
    }
  } else {
    log(`  🔍 DRY-RUN: 將刪除 ${toDelete.length} 筆 (加 --execute 執行)`)
  }

  return toDelete.length
}

async function main() {
  log(EXECUTE ? '=== 執行模式 ===' : '=== DRY-RUN 模式 ===')

  let total = 0

  // Teachers: dedup by name (第二次遷移 service_id 為 null，所以只用 name)
  total += await dedupTable(
    'teachers',
    (r) => r.name,
    '教師'
  )

  // Services: dedup by code
  total += await dedupTable(
    'services',
    (r) => r.code,
    '服務方案'
  )

  // Courses: dedup by title + service_id
  total += await dedupTable(
    'courses',
    (r) => `${r.title}|${r.service_id ?? 'null'}`,
    '線上課程'
  )

  // Subjects: dedup by title + course_id
  total += await dedupTable(
    'subjects',
    (r) => `${r.title}|${r.course_id ?? 'null'}`,
    '章節',
    'sort_order'
  )

  // Units: dedup by title + subject_id
  total += await dedupTable(
    'units',
    (r) => `${r.title}|${r.subject_id ?? 'null'}`,
    '單元',
    'sort_order'
  )

  // Physical courses: dedup by title + date
  total += await dedupTable(
    'physical_courses',
    (r) => `${r.title ?? ''}|${r.event_date ?? ''}`,
    '實體課程'
  )

  // System params: dedup by key
  total += await dedupTable(
    'system_params',
    (r) => r.key,
    '系統參數',
    'key'
  )

  log(`\n=== 總計: ${total} 筆重複 ===`)
  if (!EXECUTE && total > 0) {
    log('確認無誤後執行: node job/dedup_migration.mjs --execute')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
