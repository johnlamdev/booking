'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Auth client。
 *
 * 公開 URL 與 anon key 本來就會送到瀏覽器；真正權限由 Supabase JWT、
 * 後台 getClaims() 及業務資料庫的 workspace 授權控制。
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase browser config is missing')
  }

  return createBrowserClient(url, anonKey)
}
