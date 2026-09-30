import { randomBytes } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { googleAuthorizationUrl } from '@/server/calendar/google'
import { requireWorkspaceContext } from '@/server/workspace/context'

export async function GET(request: NextRequest) {
  const ctx = await requireWorkspaceContext()
  const state = randomBytes(24).toString('hex')
  const authorizationUrl = googleAuthorizationUrl(state)
  if (!authorizationUrl) return NextResponse.redirect(new URL('/dashboard/settings/calendar?error=not-configured', request.url))
  const response = NextResponse.redirect(authorizationUrl)
  response.cookies.set('google-calendar-state', `${state}.${ctx.workspaceId}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/google-calendar/callback',
    maxAge: 600,
  })
  return response
}
