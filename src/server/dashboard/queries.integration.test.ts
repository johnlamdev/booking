import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { listWeeklyRules } from '@/server/availability/queries'
import { listDashboardDaySummaries } from '@/server/calendar/queries'
import { db } from '@/server/db'
import { countPendingInquiries } from '@/server/inquiries/queries'
import { listActiveServices } from '@/server/services/queries'
import { bootstrapPersonalWorkspace } from '@/server/workspace/bootstrap'

import { getDashboardOverview } from './queries'

function todayInHongKong(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

afterAll(async () => {
  await db.$client.end({ timeout: 5 })
})

describe('getDashboardOverview', () => {
  it('單次 SQL 的結果與原有分開查詢一致', async () => {
    const authUserId = randomUUID()
    const workspace = await bootstrapPersonalWorkspace({
      authUserId,
      email: `${authUserId.slice(0, 8)}@example.com`,
    })
    const fromDate = todayInHongKong()
    const params = {
      workspaceId: workspace.workspaceId,
      instructorId: workspace.instructorProfileId,
      timeZone: 'Asia/Hong_Kong',
      fromDate,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 120,
    }

    const [overview, services, rules, pendingCount, daySummaries] = await Promise.all([
      getDashboardOverview(params),
      listActiveServices(workspace.workspaceId),
      listWeeklyRules(workspace.instructorProfileId),
      countPendingInquiries(workspace.workspaceId),
      listDashboardDaySummaries(params),
    ])

    expect(overview.activeServiceCount).toBe(services.length)
    expect(overview.openWeekdays).toBe(new Set(rules.map((rule) => rule.weekday)).size)
    expect(overview.pendingCount).toBe(pendingCount)
    expect(overview.daySummaries).toEqual(daySummaries)
  })
})
