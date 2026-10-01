export const COUNTRY_CODES = [
  { code: '+886', label: '台灣', flag: '🇹🇼' },
  { code: '+1', label: '美加地區', flag: '🇺🇸' },
  { code: '+44', label: '英國', flag: '🇬🇧' },
  { code: '+49', label: '德國', flag: '🇩🇪' },
  { code: '+60', label: '馬來西亞', flag: '🇲🇾' },
  { code: '+61', label: '澳大利亞', flag: '🇦🇺' },
  { code: '+62', label: '印尼', flag: '🇮🇩' },
  { code: '+63', label: '菲律賓', flag: '🇵🇭' },
  { code: '+65', label: '新加坡', flag: '🇸🇬' },
  { code: '+81', label: '日本', flag: '🇯🇵' },
  { code: '+852', label: '香港', flag: '🇭🇰' },
  { code: '+853', label: '澳門', flag: '🇲🇴' },
  { code: '+86', label: '大陸', flag: '🇨🇳' },
] as const

/**
 * Format a local phone number to E.164 format.
 * - Strips spaces, dashes
 * - Strips leading 0 (local format)
 * - Prepends country code
 *
 * Examples (Taiwan +886):
 *   "0936923912"  → "+886936923912"
 *   "936923912"   → "+886936923912"
 *   "09 3692 3912" → "+886936923912"
 */
export function formatPhoneE164(phone: string, countryCode: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  // Strip leading 0 for countries that use it as local prefix
  if (cleaned.startsWith('0') && countryCode === '+886') {
    cleaned = cleaned.slice(1)
  }
  return countryCode + cleaned
}

/**
 * 正規化成「本地儲存格式」—— users.phone 與 sms_verifications.phone 的唯一標準。
 * 台灣（+886）一律是 09 開頭的 10 碼：
 *   "905376287"      → "0905376287"   （沒打開頭 0 —— 2026-09-21 Steve 踩到的坑）
 *   "0905376287"     → "0905376287"
 *   "+886905376287"  → "0905376287"
 *   "886905376287"   → "0905376287"
 *   "09 0537-6287"   → "0905376287"
 * 其他國碼只清符號、不動格式（國際號碼支援是另一題，待議）。
 *
 * ⚠️ 所有「拿手機號查表／寫表」的伺服器端入口（sms/send、sms/verify、
 * 註冊、重設密碼）都必須先過這一層 —— 表單端有沒有補零都不能影響結果。
 */
export function normalizeLocalPhone(phone: string, countryCode: string = '+886'): string {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  if (countryCode !== '+886') return cleaned
  if (cleaned.startsWith('+886')) return '0' + cleaned.slice(4)
  // 886 開頭且長度符合「886 + 9 碼」才視為帶國碼（避免誤傷 0886… 這類想像中的市話）
  if (cleaned.startsWith('886') && cleaned.length === 12) return '0' + cleaned.slice(3)
  if (!cleaned.startsWith('0')) return '0' + cleaned
  return cleaned
}

/**
 * Validate phone number (loose — just check it has enough digits after cleanup)
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  // Strip leading 0
  const digits = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned
  return /^\d{7,15}$/.test(digits)
}
