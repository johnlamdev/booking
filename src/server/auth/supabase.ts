import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function readPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 未設定，請參考 .env.example',
    )
  }

  return { url, anonKey }
}

/**
 * 供 Server Component、Server Action 及 Route Handler 使用的 Supabase client。
 *
 * 只用 anon key。所有業務資料表為 deny-all RLS，故此 client 讀不到任何業務資料——
 * 它的職責僅限於 auth（登入、登出、讀取目前 auth user）。
 * 業務資料一律經 Drizzle 直連存取。見 docs/DESIGN.md §2.2。
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = readPublicConfig()
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Component 不允許寫 cookie。session 的更新交由 proxy 處理，
          // 此處靜默略過是 Supabase SSR 的既定作法。
        }
      },
    },
  })
}
