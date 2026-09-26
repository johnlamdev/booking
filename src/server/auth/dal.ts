import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from './supabase'

export type AuthUser = {
  authUserId: string
  email: string
  /** Supabase app_metadata 只能由管理員修改，可安全用作邀請資格。 */
  bookingAccess: 'tester' | null
}

/**
 * 讀取目前登入的 auth user，未登入回傳 null。
 *
 * 使用 `getClaims()` 驗證 JWT 簽名，而非信任只從 cookie 讀取的 session。
 * 非對稱 signing key 可在本地驗證；同時保留可靠的身份授權邊界。
 *
 * 以 React `cache` 記憶化，同一次 render 內多次呼叫只驗證一次。
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (error || !claims?.sub || typeof claims.email !== 'string') return null

  return {
    authUserId: claims.sub,
    email: claims.email,
    bookingAccess: claims.app_metadata?.booking_access === 'tester' ? 'tester' : null,
  }
})

/**
 * 後台入口的授權起點：未登入直接導向登入頁。
 *
 * proxy 的檢查是樂觀的、僅供快速導向，真正的防線是這裡——
 * 每個讀寫資料的路徑都必須經過它。見 docs/DESIGN.md §5。
 */
export const requireAuthUser = cache(async (): Promise<AuthUser> => {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  return user
})
