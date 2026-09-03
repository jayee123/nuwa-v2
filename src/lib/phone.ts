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
 * Validate phone number (loose — just check it has enough digits after cleanup)
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  // Strip leading 0
  const digits = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned
  return /^\d{7,15}$/.test(digits)
}
