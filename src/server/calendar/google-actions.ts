'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { disconnectGoogleCalendar, syncUpcomingGoogleCalendarBookings } from '@/server/calendar/google'
import { requireWorkspaceContext } from '@/server/workspace/context'

export async function disconnectGoogleCalendarAction() {
  const ctx = await requireWorkspaceContext()
  await disconnectGoogleCalendar(ctx.workspaceId)
  revalidatePath('/dashboard/settings/calendar')
}

export async function syncGoogleCalendarNowAction(afterId?: string, earlierFailed = false) {
  const ctx = await requireWorkspaceContext()
  const cursor = afterId && z.string().uuid().safeParse(afterId).success ? afterId : undefined
  return syncUpcomingGoogleCalendarBookings(ctx.workspaceId, cursor, earlierFailed === true)
}
