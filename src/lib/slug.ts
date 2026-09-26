/**
 * 公開頁 slug 的正規化與驗證。
 *
 * 純函式、無副作用，可在 server 與 client 共用（client 只作輔助提示，
 * server 才是驗證的最終依據）。
 *
 * 唯一性採「寫入前一律轉小寫 + 普通 unique index」達成 case-insensitive，
 * 不使用 citext extension。見 docs/DESIGN.md §3.2。
 */

export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 40

/**
 * 保留字：這些會與應用程式路由衝突，或預留給日後使用。
 * bootstrap 產生的 slug 與使用者自訂的 slug 都必須通過此檢查。
 *
 * 只列出「本來合法、但我們不允許」的字。像 `_next` 這類含非法字元的路由，
 * 字元規則已經擋下，不需要（也不應該）重複列在這裡。
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'auth',
  'book',
  'dashboard',
  'inquiry',
  'login',
  'logout',
  'settings',
  'signup',
  'static',
  'support',
])

export type SlugError =
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_CHARS'
  | 'EDGE_HYPHEN'
  | 'RESERVED'

/** 轉小寫並去除前後空白。儲存與比對前一律先經過此函式。 */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * 驗證已正規化的 slug。回傳 null 代表通過。
 * 注意：不檢查資料庫唯一性，那由 unique constraint 負責。
 */
export function validateSlug(input: string): SlugError | null {
  const slug = normalizeSlug(input)

  if (slug.length === 0) return 'EMPTY'
  if (slug.length < SLUG_MIN_LENGTH) return 'TOO_SHORT'
  if (slug.length > SLUG_MAX_LENGTH) return 'TOO_LONG'
  if (!/^[a-z0-9-]+$/.test(slug)) return 'INVALID_CHARS'
  if (slug.startsWith('-') || slug.endsWith('-')) return 'EDGE_HYPHEN'
  if (RESERVED_SLUGS.has(slug)) return 'RESERVED'

  return null
}

export const SLUG_ERROR_MESSAGES: Record<SlugError, string> = {
  EMPTY: '請輸入公開頁網址',
  TOO_SHORT: `公開頁網址至少需要 ${SLUG_MIN_LENGTH} 個字元`,
  TOO_LONG: `公開頁網址不可超過 ${SLUG_MAX_LENGTH} 個字元`,
  INVALID_CHARS: '公開頁網址只可使用小寫英文字母、數字及連字號',
  EDGE_HYPHEN: '公開頁網址不可以連字號開頭或結尾',
  RESERVED: '此公開頁網址已被系統保留，請選用其他名稱',
}

/** 排除易混淆字元（0/o、1/l/i），減少老師口頭傳達連結時出錯。 */
const RANDOM_SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const RANDOM_SLUG_LENGTH = 6

/**
 * 產生 bootstrap 用的隨機 slug，例如 `t-8f3k2p`。
 *
 * 新帳號在使用者填寫前就需要一個合法且唯一的 slug；onboarding 會引導改成自訂。
 * 前綴 `t-` 確保結果永遠不會落在保留字清單內。
 */
export function generateRandomSlug(): string {
  const bytes = new Uint8Array(RANDOM_SLUG_LENGTH)
  globalThis.crypto.getRandomValues(bytes)

  let suffix = ''
  for (const byte of bytes) {
    suffix += RANDOM_SLUG_ALPHABET[byte % RANDOM_SLUG_ALPHABET.length]
  }

  return `t-${suffix}`
}
