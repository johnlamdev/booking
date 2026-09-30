import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { connectGoogleCalendar } from '@/server/calendar/google'
import { requireWorkspaceContext } from '@/server/workspace/context'

export async function GET(request: NextRequest) {
  const ctx = await requireWorkspaceContext()
  const cookieStore = await cookies()
  const state = cookieStore.get('google-calendar-state')?.value
  const suppliedState = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  let outcome = 'connected'

  if (!state || state !== `${suppliedState}.${ctx.workspaceId}` || !code) outcome = 'invalid-state'
  else {
    try {
      await connectGoogleCalendar(ctx.workspaceId, code)
    } catch (error) {
      console.error('[google-calendar] connection failed', error instanceof Error ? error.message : 'unknown')
      outcome = 'connection-failed'
    }
  }

  const response = NextResponse.redirect(new URL(`/dashboard/settings/calendar?result=${outcome}`, request.url))
  response.cookies.delete({ name: 'google-calendar-state', path: '/api/google-calendar/callback' })
  return response
}
