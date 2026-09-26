const DEFAULT_AUTH_DESTINATION = '/dashboard'

/**
 * 把登入後目的地收斂為本站的相對 URL。
 *
 * WHATWG URL 會把 `/\\evil.example` 視為 `//evil.example`，所以不能只檢查
 * 兩個正斜線。先拒絕反斜線，再以固定的假 origin 解析並核對 origin。
 */
export function safeNextPath(raw: unknown, fallback = DEFAULT_AUTH_DESTINATION): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2_048) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback

  try {
    const base = new URL('https://booking.invalid')
    const parsed = new URL(raw, base)

    if (parsed.origin !== base.origin) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
