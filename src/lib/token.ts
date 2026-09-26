import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * 學生查詢狀態頁的存取權杖。
 *
 * 規格 §8.8 要求高熵、不可枚舉；§9.8 要求資料庫只存 hash。
 * 因此明文 token 只在建立當下回傳一次，之後無法從資料庫還原。
 */

/** 32 bytes = 256 bits 熵，遠超過可暴力枚舉的範圍。 */
const TOKEN_BYTES = 32

export function generateStatusToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * 以 SHA-256 雜湊 token。
 *
 * 不加 salt 也不用 bcrypt：token 本身已是 256 bits 的隨機值，
 * 沒有字典攻擊的空間，而查詢狀態頁需要用 hash 直接索引。
 */
export function hashStatusToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 定時比較，避免以回應時間推測 token。 */
export function statusTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashStatusToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')

  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/** 產生 idempotency key，供表單防止重複提交使用。 */
export function generateIdempotencyKey(): string {
  return randomBytes(16).toString('base64url')
}
