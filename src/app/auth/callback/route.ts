import { NextResponse } from 'next/server'

import { safeNextPath } from '@/lib/navigation'
import { createSupabaseServerClient } from '@/server/auth/supabase'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextPath = safeNextPath(requestUrl.searchParams.get('next'), '/dashboard')

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/login?authError=invalid-link', requestUrl.origin))
}
