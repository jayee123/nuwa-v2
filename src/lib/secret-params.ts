import { createAdminClient } from '@/lib/supabase/admin'

// Cache: avoids hitting DB on every call within the same request
let cache: Map<string, string | null> | null = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute

/**
 * Get a secret parameter. Reads from `secret_params` table first (via service_role),
 * falls back to process.env if not found or empty in DB.
 */
export async function getSecretParam(key: string): Promise<string> {
  // Check cache
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    const cached = cache.get(key)
    if (cached !== undefined) {
      return cached ?? process.env[key] ?? ''
    }
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('secret_params')
      .select('value')
      .eq('key', key)
      .single()

    if (data?.value) {
      // Update cache
      if (!cache) cache = new Map()
      cache.set(key, data.value)
      cacheTime = Date.now()
      return data.value
    }
  } catch {
    // DB not available or table doesn't exist yet, fall through
  }

  return process.env[key] ?? ''
}

/**
 * Preload all secret params into cache (call once per request if needed).
 */
export async function preloadSecretParams(): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('secret_params').select('key, value')

    cache = new Map()
    for (const row of data ?? []) {
      cache.set(row.key, row.value)
    }
    cacheTime = Date.now()
  } catch {
    // silent
  }
}
