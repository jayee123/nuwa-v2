#!/usr/bin/env node

/**
 * NUWA V1 → V2 Migration Script
 *
 * Usage:
 *   1. First dump V1 MySQL:
 *      mysqldump -h <RDS_ENDPOINT> -u <USER> -p --single-transaction nuwa > job/backups/v1_dump.sql
 *
 *   2. Or connect directly to MySQL:
 *      node job/migrate_v1_to_v2.mjs --mysql-host=<HOST> --mysql-user=<USER> --mysql-pass=<PASS> --mysql-db=nuwa
 *
 *   3. Options:
 *      --dry-run       Print what would be done without writing
 *      --skip-auth     Skip auth.users creation (if already done)
 *      --table=<name>  Migrate only a specific table
 *
 * Required env vars (in ../.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Required npm packages (install in v2/):
 *   npm install mysql2 dotenv
 */

import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'
import { randomUUID } from 'crypto'
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

// --- Config ---
const args = process.argv.slice(2)
const getArg = (name) => {
  const a = args.find((a) => a.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : null
}
const DRY_RUN = args.includes('--dry-run')
const SKIP_AUTH = args.includes('--skip-auth')
const ONLY_TABLE = getArg('table')

const MYSQL_CONFIG = {
  host: getArg('mysql-host') || '127.0.0.1',
  user: getArg('mysql-user') || 'root',
  password: getArg('mysql-pass') || '',
  database: getArg('mysql-db') || 'nuwa',
  port: parseInt(getArg('mysql-port') || '3306'),
}

// --- Supabase Admin Client ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// --- UUID Mapping ---
const uuidMap = new Map() // "table:v1_id" → v2_uuid

function mapId(table, v1Id) {
  const key = `${table}:${v1Id}`
  if (uuidMap.has(key)) return uuidMap.get(key)
  const uuid = randomUUID()
  uuidMap.set(key, uuid)
  return uuid
}

// --- Helpers ---
let stats = {}

function log(msg) {
  console.log(`[MIGRATE] ${msg}`)
}

function addStat(table, count) {
  stats[table] = (stats[table] || 0) + count
}

// --- Migration Functions ---

async function migrateUsers(conn) {
  log('=== Migrating users ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_user WHERE nuwa_user_trash = 0 OR nuwa_user_trash IS NULL"
  )
  log(`Found ${rows.length} users`)

  for (const row of rows) {
    const v2Id = mapId('user', row.nuwa_user_id)
    const phone = (row.nuwa_user_mobile || '').replace(/\s|-/g, '')

    if (!phone) {
      log(`  SKIP user ${row.nuwa_user_id}: no phone`)
      continue
    }

    // Format phone for Supabase Auth (E.164 without +)
    let authPhone = phone
    if (authPhone.startsWith('0')) authPhone = '886' + authPhone.slice(1)
    if (!authPhone.startsWith('+')) authPhone = '+' + authPhone

    // Try to find existing auth user first (for --skip-auth or re-runs)
    if (SKIP_AUTH || DRY_RUN) {
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const phoneDigits = authPhone.replace('+', '')
      const existing = listData?.users?.find((u) => (u.phone || '').replace('+', '') === phoneDigits)
      if (existing) {
        uuidMap.set(`user:${row.nuwa_user_id}`, existing.id)
        log(`  MAPPED ${phone} → ${existing.id}`)
      }
    }

    // Create auth.users entry
    if (!SKIP_AUTH && !DRY_RUN) {
      const { data, error } = await supabase.auth.admin.createUser({
        phone: authPhone,
        password: row.nuwa_user_password || 'temp_' + randomUUID().slice(0, 8),
        phone_confirm: true,
        user_metadata: { v1_id: row.nuwa_user_id },
      })
      if (error) {
        if (error.message.includes('already been registered') || error.message.includes('already registered')) {
          log(`  AUTH EXISTS ${phone}: finding existing user...`)
          // listUsers and match by phone digits (without +)
          const phoneDigits = authPhone.replace('+', '')
          const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
          const existing = listData?.users?.find((u) => {
            const uPhone = (u.phone || '').replace('+', '')
            return uPhone === phoneDigits
          })
          if (existing) {
            uuidMap.set(`user:${row.nuwa_user_id}`, existing.id)
          } else {
            log(`  WARN: could not find auth user for ${phone}`)
            continue
          }
        } else {
          log(`  ERROR auth user ${phone}: ${error.message}`)
          continue
        }
      }
      // Use the auth user's ID as the users table ID
      uuidMap.set(`user:${row.nuwa_user_id}`, data.user.id)
    }

    const userId = uuidMap.get(`user:${row.nuwa_user_id}`) || v2Id

    // Map plan
    const planMap = { '專業版': 'advanced', '基本版': 'basic', 'Premium': 'premium' }
    const currentPlan = planMap[row.nuwa_user_plan_subscribed] || 'free'

    // Map gender: V1 stores "男性"/"女性", V2 uses SMALLINT (1=male, 2=female)
    const genderMap = { '男性': 1, '女性': 2, '男': 1, '女': 2 }
    const gender = genderMap[row.nuwa_user_gender] ?? null

    const userData = {
      id: userId,
      phone: phone,
      nickname: row.nuwa_user_nickname || null,
      gender: gender,
      email: row.nuwa_user_user_email || null,
      birthday: row.nuwa_user_birthday || null,
      current_plan: currentPlan,
      dialog_limit: row.nuwa_user_dialog_limits || 0,
      plan_deadline: row.nuwa_user_sub_deadline || null,
      role: 'user',
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert user ${phone} → ${userId}`)
    } else {
      const { error } = await supabase.from('users').upsert(userData)
      if (error) log(`  ERROR user ${phone}: ${error.message}`)
    }
    addStat('users', 1)
  }
}

async function migrateSettings(conn) {
  log('=== Migrating settings → services ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_setting WHERE nuwa_setting_trash = 0 OR nuwa_setting_trash IS NULL"
  )
  log(`Found ${rows.length} settings`)

  for (const row of rows) {
    const v2Id = mapId('service', row.nuwa_setting_id)
    const code = (row.nuwa_setting_service_name || '').toLowerCase().replace(/\s/g, '-')

    const data = {
      id: v2Id,
      code: code || `service-${row.nuwa_setting_id}`,
      name: row.nuwa_setting_service_name || '未命名',
      description: null,
      plans: '[]',
      is_active: true,
      sort_order: row.nuwa_setting_id,
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert service ${data.name} → ${v2Id}`)
    } else {
      const { error } = await supabase.from('services').upsert(data)
      if (error) log(`  ERROR service: ${error.message}`)
    }
    addStat('services', 1)
  }
}

async function migrateTeachers(conn) {
  log('=== Migrating teachers ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_teacher WHERE nuwa_teacher_trash = 0 OR nuwa_teacher_trash IS NULL"
  )
  log(`Found ${rows.length} teachers`)

  for (const row of rows) {
    const v2Id = mapId('teacher', row.nuwa_teacher_id)

    const data = {
      id: v2Id,
      name: row.nuwa_teacher_name || '未命名',
      system_prompt: row.nuwa_teacher_promt || null,
      welcome_msg: row.nuwa_teacher_welcome_msg || null,
      is_active: true,
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert teacher ${data.name} → ${v2Id}`)
    } else {
      const { error } = await supabase.from('teachers').upsert(data)
      if (error) log(`  ERROR teacher: ${error.message}`)
    }
    addStat('teachers', 1)
  }
}

async function migrateCourses(conn) {
  log('=== Migrating courses + subjects + units ===')

  // Courses
  const [courses] = await conn.execute(
    "SELECT * FROM nuwa_course WHERE nuwa_course_trash = 0 OR nuwa_course_trash IS NULL"
  )
  log(`Found ${courses.length} courses`)

  for (const row of courses) {
    const v2Id = mapId('course', row.nuwa_course_id)
    // Try to map service_id
    const serviceId = uuidMap.get(`service:${row.nuwa_course_service_id}`)

    const data = {
      id: v2Id,
      service_id: serviceId || null,
      title: row.nuwa_course_title || '未命名課程',
      sort_order: row.nuwa_course_num || 0,
    }

    if (!DRY_RUN) {
      const { error } = await supabase.from('courses').upsert(data)
      if (error) log(`  ERROR course "${data.title}": ${error.message}`)
      else log(`  OK course "${data.title}" → ${v2Id}`)
    }
    addStat('courses', 1)
  }

  // Subjects (chapters)
  const [subjects] = await conn.execute(
    "SELECT * FROM nuwa_course_subject WHERE nuwa_course_subject_trash = 0 OR nuwa_course_subject_trash IS NULL ORDER BY nuwa_course_subject_num"
  )
  log(`Found ${subjects.length} subjects`)

  for (const row of subjects) {
    const v2Id = mapId('subject', row.nuwa_course_subject_id)
    const courseId = uuidMap.get(`course:${row.nuwa_course_subject_course_id}`)
    if (!courseId) { log(`  SKIP subject ${row.nuwa_course_subject_id}: no mapped course`); continue }

    const data = {
      id: v2Id,
      course_id: courseId,
      title: row.nuwa_course_subject_title || '未命名章節',
      sort_order: row.nuwa_course_subject_num || 0,
    }

    if (!DRY_RUN) {
      const { error } = await supabase.from('subjects').upsert(data)
      if (error) log(`  ERROR subject: ${error.message}`)
    }
    addStat('subjects', 1)
  }

  // Units (with YouTube links)
  const [units] = await conn.execute(
    "SELECT * FROM nuwa_course_unit WHERE nuwa_course_unit_trash = 0 OR nuwa_course_unit_trash IS NULL ORDER BY nuwa_course_unit_num"
  )
  log(`Found ${units.length} units`)

  for (const row of units) {
    const v2Id = mapId('unit', row.nuwa_course_unit_id)
    const subjectId = uuidMap.get(`subject:${row.nuwa_course_unit_subject_id}`)
    if (!subjectId) { log(`  SKIP unit ${row.nuwa_course_unit_id}: no mapped subject`); continue }

    const data = {
      id: v2Id,
      subject_id: subjectId,
      title: row.nuwa_course_unit_title || '未命名單元',
      content_url: row.nuwa_course_unit_link || null,
      sort_order: row.nuwa_course_unit_num || 0,
    }

    if (!DRY_RUN) {
      const { error } = await supabase.from('units').upsert(data)
      if (error) log(`  ERROR unit: ${error.message}`)
      else if (data.content_url) log(`  OK unit "${data.title}" → ${data.content_url}`)
    }
    addStat('units', 1)
  }
}

async function migrateTopics(conn) {
  log('=== Migrating topics ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_topic WHERE nuwa_topic_trash = 0 OR nuwa_topic_trash IS NULL"
  )
  log(`Found ${rows.length} topics`)

  for (const row of rows) {
    const v2Id = mapId('topic', row.nuwa_topic_id)
    const userId = uuidMap.get(`user:${row.nuwa_topic_user_id}`)

    if (!userId) {
      log(`  SKIP topic ${row.nuwa_topic_id}: no mapped user`)
      continue
    }

    const data = {
      id: v2Id,
      user_id: userId,
      title: row.nuwa_topic_name || '對話',
      is_pinned: row.nuwa_topic_sort_sticky === 1,
      created_at: row.nuwa_topic_created_at || new Date().toISOString(),
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert topic "${data.title}" → ${v2Id}`)
    } else {
      const { error } = await supabase.from('chat_topics').upsert(data)
      if (error) log(`  ERROR topic: ${error.message}`)
    }
    addStat('chat_topics', 1)
  }
}

async function migrateChatHistory(conn) {
  log('=== Migrating chat messages ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_chathistory WHERE nuwa_chathistory_trash = 0 OR nuwa_chathistory_trash IS NULL ORDER BY nuwa_chathistory_created_at"
  )
  log(`Found ${rows.length} messages`)

  const batch = []
  for (const row of rows) {
    const topicId = uuidMap.get(`topic:${row.nuwa_chathistory_topic_id}`)
    if (!topicId) continue

    batch.push({
      topic_id: topicId,
      role: row.nuwa_chathistory_role === 'assistant' ? 'assistant' : 'user',
      content: row.nuwa_chathistory_msg || '',
      created_at: row.nuwa_chathistory_created_at || new Date().toISOString(),
    })
  }

  if (DRY_RUN) {
    log(`  DRY-RUN: would insert ${batch.length} messages`)
  } else {
    // Insert in chunks of 500
    for (let i = 0; i < batch.length; i += 500) {
      const chunk = batch.slice(i, i + 500)
      const { error } = await supabase.from('chat_messages').insert(chunk)
      if (error) log(`  ERROR messages chunk ${i}: ${error.message}`)
    }
  }
  addStat('chat_messages', batch.length)
}

async function migratePayments(conn) {
  log('=== Migrating payments ===')
  const [rows] = await conn.execute("SELECT * FROM nuwa_payment")
  log(`Found ${rows.length} payments`)

  for (const row of rows) {
    const userId = uuidMap.get(`user:${row.nuwa_payment_user_id}`)
    if (!userId) continue

    const statusMap = { '已付款': 'paid', '待付款': 'pending', '失敗': 'failed' }

    const data = {
      user_id: userId,
      amount: row.nuwa_payment_price || 0,
      plan_name: row.nuwa_payment_service_plan || row.nuwa_payment_service_name || null,
      payment_uid: row.nuwa_payment_uid || null,
      token_data: row.nuwa_payment_tokendata || null,
      status: statusMap[row.nuwa_payment_status] || 'pending',
      paid_at: row.nuwa_payment_status === '已付款' ? row.nuwa_payment_updated_at : null,
      created_at: row.nuwa_payment_created_at || new Date().toISOString(),
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert payment ${data.payment_uid}`)
    } else {
      const { error } = await supabase.from('payments').insert(data)
      if (error) log(`  ERROR payment: ${error.message}`)
    }
    addStat('payments', 1)
  }
}

async function migrateSubscriptions(conn) {
  log('=== Migrating subscriptions ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_subscribe WHERE nuwa_subscribe_trash = 0 OR nuwa_subscribe_trash IS NULL"
  )
  log(`Found ${rows.length} subscriptions`)

  for (const row of rows) {
    const userId = uuidMap.get(`user:${row.nuwa_subscribe_user_id}`)
    if (!userId) continue

    const data = {
      user_id: userId,
      plan_name: row.nuwa_subscribe_service_id || 'unknown',
      starts_at: row.nuwa_subscribe_created_at || new Date().toISOString(),
      ends_at: row.nuwa_subscribe_end_date || new Date().toISOString(),
      status: 'active',
      created_at: row.nuwa_subscribe_created_at || new Date().toISOString(),
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert subscription for user ${userId}`)
    } else {
      const { error } = await supabase.from('subscriptions').insert(data)
      if (error) log(`  ERROR subscription: ${error.message}`)
    }
    addStat('subscriptions', 1)
  }
}

async function migratePhysicalCourses(conn) {
  log('=== Migrating physical courses ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_courses_physical WHERE nuwa_courses_physical_trash = 0 OR nuwa_courses_physical_trash IS NULL"
  )
  log(`Found ${rows.length} physical courses`)

  for (const row of rows) {
    const v2Id = mapId('physical', row.nuwa_courses_physical_id)

    const data = {
      id: v2Id,
      name: row.nuwa_courses_physical_name || '未命名',
      description: row.nuwa_courses_physical_desp || null,
      price: row.nuwa_courses_physical_price || 0,
      location: row.nuwa_courses_physical_location || null,
      course_code: row.nuwa_courses_physical_code || null,
      notice: row.nuwa_courses_physical_notice || null,
      points_reward: row.nuwa_courses_physical_point || 0,
      reg_start: row.nuwa_courses_physical_reg_start || null,
      reg_end: row.nuwa_courses_physical_reg_end || null,
      class_start: row.nuwa_courses_physical_class_start || null,
      class_end: row.nuwa_courses_physical_class_end || null,
      status: row.nuwa_courses_physical_status || 'planned',
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert physical course "${data.name}" → ${v2Id}`)
    } else {
      const { error } = await supabase.from('physical_courses').upsert(data)
      if (error) log(`  ERROR physical course: ${error.message}`)
    }
    addStat('physical_courses', 1)
  }
}

async function migrateRegistrations(conn) {
  log('=== Migrating registrations ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_register WHERE nuwa_register_trash = 0 OR nuwa_register_trash IS NULL"
  )
  log(`Found ${rows.length} registrations`)

  for (const row of rows) {
    const userId = uuidMap.get(`user:${row.nuwa_register_user_id}`)
    const physicalId = uuidMap.get(`physical:${row.nuwa_register_courses_physical_id}`)
    if (!userId) continue

    const data = {
      user_id: userId,
      physical_course_id: physicalId || null,
      email: row.nuwa_register_user_email || null,
      status: row.nuwa_register_status || 'registered',
      created_at: row.nuwa_register_created_at || new Date().toISOString(),
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert registration`)
    } else {
      const { error } = await supabase.from('registrations').insert(data)
      if (error) log(`  ERROR registration: ${error.message}`)
    }
    addStat('registrations', 1)
  }
}

async function migrateParams(conn) {
  log('=== Migrating system params ===')
  const [rows] = await conn.execute(
    "SELECT * FROM nuwa_param WHERE nuwa_param_trash = 0 OR nuwa_param_trash IS NULL"
  )
  log(`Found ${rows.length} params`)

  for (const row of rows) {
    const data = {
      key: row.nuwa_param_key || `param_${row.nuwa_param_id}`,
      value: row.nuwa_param_value || null,
    }

    if (DRY_RUN) {
      log(`  DRY-RUN: would insert param "${data.key}"`)
    } else {
      const { error } = await supabase.from('system_params').upsert(data)
      if (error) log(`  ERROR param: ${error.message}`)
    }
    addStat('system_params', 1)
  }
}

// --- Main ---

async function main() {
  log('========================================')
  log('NUWA V1 → V2 Migration')
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  log(`MySQL: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`)
  log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  log('========================================')

  const conn = await mysql.createConnection(MYSQL_CONFIG)
  log('Connected to MySQL')

  const tables = {
    users: migrateUsers,
    services: migrateSettings,
    teachers: migrateTeachers,
    courses: migrateCourses,
    topics: migrateTopics,
    messages: migrateChatHistory,
    payments: migratePayments,
    subscriptions: migrateSubscriptions,
    physical: migratePhysicalCourses,
    registrations: migrateRegistrations,
    params: migrateParams,
  }

  // Order matters: users first (for UUID mapping), then others
  const order = ['users', 'services', 'teachers', 'courses', 'topics', 'messages', 'payments', 'subscriptions', 'physical', 'registrations', 'params']

  for (const table of order) {
    if (ONLY_TABLE && ONLY_TABLE !== table) continue
    try {
      await tables[table](conn)
    } catch (err) {
      log(`FATAL ERROR on ${table}: ${err.message}`)
    }
  }

  await conn.end()

  // Print summary
  log('')
  log('========================================')
  log('Migration Summary')
  log('========================================')
  for (const [table, count] of Object.entries(stats)) {
    log(`  ${table}: ${count} records`)
  }
  log(`  UUID mappings: ${uuidMap.size}`)
  log(`  Mode: ${DRY_RUN ? 'DRY RUN (nothing written)' : 'LIVE'}`)
  log('========================================')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
