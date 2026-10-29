// 後台「系統設定」儲存金鑰：驗證輸入、一次 upsert 全部、把資料庫錯誤回報給呼叫端。
// 以前逐筆 upsert 又不看回傳的 error，寫入失敗畫面照樣顯示「已儲存」（2026-10-15 SunPay 設定就這樣沒存到）。

export interface SecretParamInput {
  key: string
  value: string
}

export type ParseSecretParamsResult =
  | { ok: true; params: SecretParamInput[] }
  | { ok: false; error: string }

export type SaveSecretParamsResult =
  | { ok: true; savedKeys: string[] }
  | { ok: false; error: string }

interface UpsertableTable {
  upsert(rows: { key: string; value: string; updated_at: string }[]): PromiseLike<{ error: { message: string } | null }>
}

export interface SecretParamsWriter {
  from(table: 'secret_params'): UpsertableTable
}

const MAX_KEY_LENGTH = 100

/** 檢查請求內容；空值的項目略過（不拿空字串蓋掉既有值）。 */
export function parseSecretParams(body: unknown): ParseSecretParamsResult {
  const list = (body as { params?: unknown } | null)?.params
  if (!Array.isArray(list)) return { ok: false, error: '請求格式錯誤' }

  const params: SecretParamInput[] = []
  for (const item of list) {
    const { key, value } = (item ?? {}) as { key?: unknown; value?: unknown }
    if (typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH || typeof value !== 'string') {
      return { ok: false, error: '請求格式錯誤' }
    }
    if (value) params.push({ key, value })
  }
  return { ok: true, params }
}

/** 一次寫入全部；任何一筆失敗整批都不會寫進去。 */
export async function saveSecretParams(
  db: SecretParamsWriter,
  params: SecretParamInput[],
  now: Date = new Date(),
): Promise<SaveSecretParamsResult> {
  if (params.length === 0) return { ok: true, savedKeys: [] }

  const updatedAt = now.toISOString()
  const rows = params.map(({ key, value }) => ({ key, value, updated_at: updatedAt }))
  const { error } = await db.from('secret_params').upsert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true, savedKeys: params.map((p) => p.key) }
}
