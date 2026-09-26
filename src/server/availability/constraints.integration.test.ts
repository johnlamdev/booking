import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/server/db'
import {
  availabilityExceptions,
  availabilityRules,
  services,
  workspaces,
} from '@/server/db/schema'
import { bootstrapPersonalWorkspace } from '@/server/workspace/bootstrap'

/**
 * 驗證資料庫層對開放規則的保證。
 *
 * 這些約束下沉到 DB，因為只有它們在併發下依然成立——
 * 應用層的預先檢查擋不住競態。
 */

type Ctx = { workspaceId: string; instructorId: string; serviceId: string }

async function createWorkspace(): Promise<Ctx> {
  const authUserId = randomUUID()
  const result = await bootstrapPersonalWorkspace({
    authUserId,
    email: `${authUserId.slice(0, 8)}@example.com`,
  })

  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.workspaceId, result.workspaceId))
    .limit(1)

  if (!service) throw new Error('預期 bootstrap 會建立預設服務')

  return {
    workspaceId: result.workspaceId,
    instructorId: result.instructorProfileId,
    serviceId: service.id,
  }
}

/**
 * 取出 Postgres 的 SQLSTATE，成功則回傳 undefined。
 * Drizzle 把驅動錯誤包進 DrizzleQueryError，實際 code 落在 `cause`。
 */
async function pgErrorCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
    return undefined
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } }
    return e.code ?? e.cause?.code
  }
}

afterAll(async () => {
  await db.$client.end({ timeout: 5 })
})

describe('availability_rules 約束', () => {
  it('接受同一天的多段開放時間（表達午休）', async () => {
    const ctx = await createWorkspace()

    const code = await pgErrorCode(() =>
      db.insert(availabilityRules).values([
        {
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorId,
          weekday: 2,
          startTime: '10:00',
          endTime: '13:00',
        },
        {
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorId,
          weekday: 2,
          startTime: '14:00',
          endTime: '18:00',
        },
      ]),
    )

    expect(code).toBeUndefined()
  })

  it('拒絕不合法的 weekday', async () => {
    const ctx = await createWorkspace()

    for (const weekday of [-1, 7, 99]) {
      const code = await pgErrorCode(() =>
        db.insert(availabilityRules).values({
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorId,
          weekday,
          startTime: '10:00',
          endTime: '18:00',
        }),
      )

      expect(code, `weekday=${weekday} 應被拒絕`).toBe('23514')
    }
  })

  it('拒絕結束時間不晚於開始時間', async () => {
    const ctx = await createWorkspace()

    const code = await pgErrorCode(() =>
      db.insert(availabilityRules).values({
        workspaceId: ctx.workspaceId,
        instructorId: ctx.instructorId,
        weekday: 1,
        startTime: '18:00',
        endTime: '10:00',
      }),
    )

    expect(code).toBe('23514')
  })

  it('無法把規則掛到別的 workspace 的 instructor 之下', async () => {
    const mine = await createWorkspace()
    const theirs = await createWorkspace()

    const code = await pgErrorCode(() =>
      db.insert(availabilityRules).values({
        workspaceId: mine.workspaceId,
        instructorId: theirs.instructorId,
        weekday: 1,
        startTime: '10:00',
        endTime: '18:00',
      }),
    )

    expect(code).toBe('23503')
  })
})

describe('availability_exceptions 約束', () => {
  it('同一日期只能有一筆覆寫', async () => {
    const ctx = await createWorkspace()

    await db.insert(availabilityExceptions).values({
      workspaceId: ctx.workspaceId,
      instructorId: ctx.instructorId,
      date: '2027-01-05',
      isClosed: true,
    })

    const code = await pgErrorCode(() =>
      db.insert(availabilityExceptions).values({
        workspaceId: ctx.workspaceId,
        instructorId: ctx.instructorId,
        date: '2027-01-05',
        isClosed: true,
      }),
    )

    expect(code).toBe('23505')
  })

  it('休假時不可帶時間', async () => {
    const ctx = await createWorkspace()

    const code = await pgErrorCode(() =>
      db.insert(availabilityExceptions).values({
        workspaceId: ctx.workspaceId,
        instructorId: ctx.instructorId,
        date: '2027-01-06',
        isClosed: true,
        startTime: '10:00',
        endTime: '12:00',
      }),
    )

    expect(code).toBe('23514')
  })

  it('特別時間必須帶完整且合法的起訖', async () => {
    const ctx = await createWorkspace()

    // 缺結束時間
    expect(
      await pgErrorCode(() =>
        db.insert(availabilityExceptions).values({
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorId,
          date: '2027-01-07',
          isClosed: false,
          startTime: '10:00',
        }),
      ),
    ).toBe('23514')

    // 結束早於開始
    expect(
      await pgErrorCode(() =>
        db.insert(availabilityExceptions).values({
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorId,
          date: '2027-01-08',
          isClosed: false,
          startTime: '14:00',
          endTime: '10:00',
        }),
      ),
    ).toBe('23514')

    // 合法
    expect(
      await pgErrorCode(() =>
        db.insert(availabilityExceptions).values({
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorId,
          date: '2027-01-09',
          isClosed: false,
          startTime: '10:00',
          endTime: '14:00',
        }),
      ),
    ).toBeUndefined()
  })

  it('不同老師可以在同一天各自設定覆寫', async () => {
    const a = await createWorkspace()
    const b = await createWorkspace()

    await db.insert(availabilityExceptions).values({
      workspaceId: a.workspaceId,
      instructorId: a.instructorId,
      date: '2027-02-01',
      isClosed: true,
    })

    const code = await pgErrorCode(() =>
      db.insert(availabilityExceptions).values({
        workspaceId: b.workspaceId,
        instructorId: b.instructorId,
        date: '2027-02-01',
        isClosed: true,
      }),
    )

    expect(code).toBeUndefined()
  })
})

describe('workspace 排程設定', () => {
  it('新 workspace 帶入預設值', async () => {
    const ctx = await createWorkspace()

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))

    expect(workspace!.slotIntervalMinutes).toBe(30)
    expect(workspace!.minNoticeMinutes).toBe(120)
    expect(workspace!.bookingHorizonDays).toBe(60)
  })
})
