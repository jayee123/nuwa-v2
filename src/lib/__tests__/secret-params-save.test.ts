import { describe, expect, it, vi } from 'vitest'
import { parseSecretParams, saveSecretParams, type SecretParamsWriter } from '../secret-params-save'

function fakeDb(error: { message: string } | null = null) {
  const upsert = vi.fn(async () => ({ error }))
  const db: SecretParamsWriter = { from: vi.fn(() => ({ upsert })) }
  return { db, upsert }
}

describe('parseSecretParams', () => {
  it('略過空值，不拿空字串蓋掉既有金鑰', () => {
    const result = parseSecretParams({ params: [{ key: 'A', value: 'x' }, { key: 'B', value: '' }] })
    expect(result).toEqual({ ok: true, params: [{ key: 'A', value: 'x' }] })
  })

  it('params 不是陣列：格式錯誤', () => {
    expect(parseSecretParams({ params: 'A=x' }).ok).toBe(false)
    expect(parseSecretParams(null).ok).toBe(false)
  })

  it('key 不是字串、是空的或太長：格式錯誤', () => {
    expect(parseSecretParams({ params: [{ key: 1, value: 'x' }] }).ok).toBe(false)
    expect(parseSecretParams({ params: [{ key: '', value: 'x' }] }).ok).toBe(false)
    expect(parseSecretParams({ params: [{ key: 'K'.repeat(101), value: 'x' }] }).ok).toBe(false)
  })

  it('value 不是字串：格式錯誤', () => {
    expect(parseSecretParams({ params: [{ key: 'A', value: 123 }] }).ok).toBe(false)
  })
})

describe('saveSecretParams', () => {
  const now = new Date('2026-10-15T00:00:00Z')

  it('成功：一次 upsert 全部，回傳存了哪些 key', async () => {
    const { db, upsert } = fakeDb()
    const result = await saveSecretParams(db, [{ key: 'A', value: '1' }, { key: 'B', value: '2' }], now)

    expect(result).toEqual({ ok: true, savedKeys: ['A', 'B'] })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith([
      { key: 'A', value: '1', updated_at: '2026-10-15T00:00:00.000Z' },
      { key: 'B', value: '2', updated_at: '2026-10-15T00:00:00.000Z' },
    ])
  })

  it('資料庫回錯誤：回報失敗，不能當成已儲存', async () => {
    const { db } = fakeDb({ message: 'permission denied for table secret_params' })
    const result = await saveSecretParams(db, [{ key: 'A', value: '1' }], now)
    expect(result).toEqual({ ok: false, error: 'permission denied for table secret_params' })
  })

  it('沒有要存的：不碰資料庫', async () => {
    const { db, upsert } = fakeDb()
    expect(await saveSecretParams(db, [], now)).toEqual({ ok: true, savedKeys: [] })
    expect(upsert).not.toHaveBeenCalled()
  })
})
