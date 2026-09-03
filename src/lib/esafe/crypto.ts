import crypto from 'crypto'
import { getSecretParam } from '@/lib/secret-params'

async function getKeys() {
  const encKey = await getSecretParam('ESAFE_ENC_KEY')
  const encIv = await getSecretParam('ESAFE_ENC_IV')
  return { encKey, encIv }
}

export async function encrypt(data: Record<string, unknown>): Promise<string> {
  const { encKey, encIv } = await getKeys()
  const json = JSON.stringify(data)
  const key = Buffer.from(encKey, 'base64')
  const iv = Buffer.from(encIv, 'base64')
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return encrypted.toString('base64')
}

export async function decrypt(base64Str: string): Promise<Record<string, unknown>> {
  const { encKey, encIv } = await getKeys()
  const cleaned = decodeURIComponent(base64Str).replace(/ /g, '+')
  const key = Buffer.from(encKey, 'base64')
  const iv = Buffer.from(encIv, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cleaned, 'base64')),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString('utf8'))
}
