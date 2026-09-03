#!/usr/bin/env node

/**
 * NUWA V1 → V2 Migration Verification
 *
 * Usage:
 *   node job/verify_migration.mjs --mysql-host=<HOST> --mysql-user=<USER> --mysql-pass=<PASS> --mysql-db=nuwa
 */

import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const args = process.argv.slice(2)
const getArg = (name) => {
  const a = args.find((a) => a.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : null
}

const MYSQL_CONFIG = {
  host: getArg('mysql-host') || '127.0.0.1',
  user: getArg('mysql-user') || 'root',
  password: getArg('mysql-pass') || '',
  database: getArg('mysql-db') || 'nuwa',
  port: parseInt(getArg('mysql-port') || '3306'),
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function log(msg) {
  console.log(msg)
}

async function main() {
  log('========================================')
  log('NUWA Migration Verification')
  log('========================================\n')

  const conn = await mysql.createConnection(MYSQL_CONFIG)

  const checks = [
    {
      name: 'Users',
      v1: "SELECT COUNT(*) as c FROM nuwa_user WHERE nuwa_user_trash = 0 OR nuwa_user_trash IS NULL",
      v2: 'users',
    },
    {
      name: 'Teachers',
      v1: "SELECT COUNT(*) as c FROM nuwa_teacher WHERE nuwa_teacher_trash = 0 OR nuwa_teacher_trash IS NULL",
      v2: 'teachers',
    },
    {
      name: 'Topics',
      v1: "SELECT COUNT(*) as c FROM nuwa_topic WHERE nuwa_topic_trash = 0 OR nuwa_topic_trash IS NULL",
      v2: 'chat_topics',
    },
    {
      name: 'Chat Messages',
      v1: "SELECT COUNT(*) as c FROM nuwa_chathistory WHERE nuwa_chathistory_trash = 0 OR nuwa_chathistory_trash IS NULL",
      v2: 'chat_messages',
    },
    {
      name: 'Payments',
      v1: "SELECT COUNT(*) as c FROM nuwa_payment",
      v2: 'payments',
    },
    {
      name: 'Subscriptions',
      v1: "SELECT COUNT(*) as c FROM nuwa_subscribe WHERE nuwa_subscribe_trash = 0 OR nuwa_subscribe_trash IS NULL",
      v2: 'subscriptions',
    },
    {
      name: 'Physical Courses',
      v1: "SELECT COUNT(*) as c FROM nuwa_courses_physical WHERE nuwa_courses_physical_trash = 0 OR nuwa_courses_physical_trash IS NULL",
      v2: 'physical_courses',
    },
    {
      name: 'Registrations',
      v1: "SELECT COUNT(*) as c FROM nuwa_register WHERE nuwa_register_trash = 0 OR nuwa_register_trash IS NULL",
      v2: 'registrations',
    },
    {
      name: 'System Params',
      v1: "SELECT COUNT(*) as c FROM nuwa_param WHERE nuwa_param_trash = 0 OR nuwa_param_trash IS NULL",
      v2: 'system_params',
    },
  ]

  let allPassed = true

  log('1. Record Count Comparison')
  log('─────────────────────────────────────')
  log(`${'Table'.padEnd(20)} ${'V1'.padStart(8)} ${'V2'.padStart(8)}  Status`)
  log('─────────────────────────────────────')

  for (const check of checks) {
    const [[v1Row]] = await conn.execute(check.v1)
    const v1Count = v1Row.c

    const { count: v2Count } = await supabase
      .from(check.v2)
      .select('id', { count: 'exact', head: true })

    const match = v1Count === v2Count
    if (!match) allPassed = false

    log(
      `${check.name.padEnd(20)} ${String(v1Count).padStart(8)} ${String(v2Count ?? 0).padStart(8)}  ${match ? '✅' : '❌ MISMATCH'}`
    )
  }

  // Auth users check
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const { count: usersCount } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })

  log('')
  log('2. Auth Consistency')
  log('─────────────────────────────────────')
  log(`  auth.users:  ${authUsers?.users?.length ?? 0}`)
  log(`  users table: ${usersCount ?? 0}`)
  log(`  Match: ${(authUsers?.users?.length ?? 0) === (usersCount ?? 0) ? '✅' : '❌'}`)

  // Sample data check
  log('')
  log('3. Sample Data Spot Check')
  log('─────────────────────────────────────')

  // Check first 3 users have phone numbers
  const { data: sampleUsers } = await supabase
    .from('users')
    .select('phone, nickname')
    .limit(3)

  for (const u of sampleUsers ?? []) {
    log(`  User: ${u.nickname ?? '?'} | Phone: ${u.phone ?? 'MISSING'} ${u.phone ? '✅' : '❌'}`)
  }

  // Check chat messages have valid topic_ids
  const { data: orphanCheck } = await supabase.rpc('check_orphan_messages')
    .catch(() => ({ data: null }))

  if (orphanCheck === null) {
    // Fallback: just check a sample
    const { data: sampleMsgs } = await supabase
      .from('chat_messages')
      .select('id, topic_id')
      .limit(5)

    for (const m of sampleMsgs ?? []) {
      const { data: topic } = await supabase
        .from('chat_topics')
        .select('id')
        .eq('id', m.topic_id)
        .single()
      log(`  Message ${m.id.slice(0, 8)}... → Topic ${topic ? '✅' : '❌ ORPHAN'}`)
    }
  }

  await conn.end()

  log('')
  log('========================================')
  log(`Overall: ${allPassed ? '✅ ALL PASSED' : '❌ SOME CHECKS FAILED'}`)
  log('========================================')

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
