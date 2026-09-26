import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { generateStatusToken, hashStatusToken } from '@/lib/token'
import { db } from '@/server/db'
import {
  availabilityExceptions,
  bookingInquiries,
  inquiryStatusEvents,
  services,
  workspaceMembers,
} from '@/server/db/schema'
import { bootstrapPersonalWorkspace } from '@/server/workspace/bootstrap'

import { cancelConfirmedInquiry, confirmInquiry, rejectInquiry } from './confirm'
import {
  countPendingInquiries,
  getInquiryByStatusToken,
  listInquiries,
  reconcileExpiredInquiries,
} from './queries'

/**
 * 確認交易的併發與狀態保證（規格 §14.4）。
 *
 * 這組測試是整個 MVP 最重要的一環：它證明兩個同時發生的確認請求
 * 最多只有一個成功，資料庫最終狀態一致。
 */

type Ctx = {
  workspaceId: string
  instructorId: string
  serviceId: string
  userId: string
}

async function createWorkspace(): Promise<Ctx> {
  const authUserId = randomUUID()
  const result = await bootstrapPersonalWorkspace({
    authUserId,
    email: `${authUserId.slice(0, 8)}@example.com`,
  })

  // 此測試只驗證自行建立的查詢；移除 bootstrap 的新帳戶體驗資料以保持隔離。
  await db.delete(bookingInquiries).where(eq(bookingInquiries.workspaceId, result.workspaceId))

  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.workspaceId, result.workspaceId))
    .limit(1)

  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, result.workspaceId))
    .limit(1)

  return {
    workspaceId: result.workspaceId,
    instructorId: result.instructorProfileId,
    serviceId: service!.id,
    userId: member!.userId,
  }
}

/** 建立一筆待確認查詢。預設時間在未來，避免觸發「已過去」的檢查。 */
async function createPending(
  ctx: Ctx,
  opts: { startIso?: string; durationMinutes?: number; name?: string } = {},
) {
  const startAt = new Date(opts.startIso ?? '2027-06-01T02:00:00Z')
  const endAt = new Date(startAt.getTime() + (opts.durationMinutes ?? 60) * 60_000)
  const token = generateStatusToken()

  const [row] = await db
    .insert(bookingInquiries)
    .values({
      workspaceId: ctx.workspaceId,
      instructorId: ctx.instructorId,
      serviceId: ctx.serviceId,
      startAt,
      endAt,
      studentName: opts.name ?? '學生',
      studentEmail: 'student@example.com',
      status: 'PENDING',
      privacyConsentAt: new Date(),
      statusTokenHash: hashStatusToken(token),
      idempotencyKey: randomUUID(),
    })
    .returning({ id: bookingInquiries.id })

  return { id: row!.id, token, startAt, endAt }
}

async function statusOf(id: string) {
  const [row] = await db
    .select({ status: bookingInquiries.status })
    .from(bookingInquiries)
    .where(eq(bookingInquiries.id, id))

  return row!.status
}

afterAll(async () => {
  await db.$client.end({ timeout: 5 })
})

describe('確認查詢', () => {
  it('待確認轉為已確認，並寫入 audit 事件', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx)

    const result = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
    })

    expect(result).toEqual({ ok: true, conflictCount: 0 })
    expect(await statusOf(inquiry.id)).toBe('CONFIRMED')

    const events = await db
      .select()
      .from(inquiryStatusEvents)
      .where(eq(inquiryStatusEvents.bookingInquiryId, inquiry.id))

    expect(events).toHaveLength(1)
    expect(events[0]!.toStatus).toBe('CONFIRMED')
    expect(events[0]!.actorType).toBe('USER')
  })

  it('不開放日的待確認查詢不能被確認', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx, { startIso: '2027-06-01T02:00:00Z' })
    await db.insert(availabilityExceptions).values({
      workspaceId: ctx.workspaceId,
      instructorId: ctx.instructorId,
      date: '2027-06-01',
      isClosed: true,
      note: '測試不開放',
    })

    const result = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
    })

    expect(result).toEqual({ ok: false, error: '這一天已設為不開放，不能確認查詢。請拒絕或回覆學生另選時間。' })
    expect(await statusOf(inquiry.id)).toBe('PENDING')
  })

  it('同一時段可以有多筆待確認——待確認不佔用時間（規格 §11.1）', async () => {
    const ctx = await createWorkspace()

    const a = await createPending(ctx, { name: '學生A' })
    const b = await createPending(ctx, { name: '學生B' })
    const c = await createPending(ctx, { name: '學生C' })

    expect(await statusOf(a.id)).toBe('PENDING')
    expect(await statusOf(b.id)).toBe('PENDING')
    expect(await statusOf(c.id)).toBe('PENDING')
  })

  it('確認一筆後，同時段其餘待確認自動轉為 REJECTED_CONFLICT', async () => {
    const ctx = await createWorkspace()

    const chosen = await createPending(ctx, { name: '被選中的學生' })
    const other1 = await createPending(ctx, { name: '其他學生1' })
    const other2 = await createPending(ctx, { name: '其他學生2' })

    const result = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: chosen.id,
    })

    expect(result).toEqual({ ok: true, conflictCount: 2 })
    expect(await statusOf(chosen.id)).toBe('CONFIRMED')
    expect(await statusOf(other1.id)).toBe('REJECTED_CONFLICT')
    expect(await statusOf(other2.id)).toBe('REJECTED_CONFLICT')
  })

  it('部分重疊的待確認也會被自動拒絕', async () => {
    const ctx = await createWorkspace()

    const chosen = await createPending(ctx, { startIso: '2027-06-02T02:00:00Z' })
    // 02:30–03:30 與 02:00–03:00 重疊
    const overlapping = await createPending(ctx, { startIso: '2027-06-02T02:30:00Z' })
    // 03:00–04:00 與前者相接，不算重疊（規格 §11.8）
    const adjacent = await createPending(ctx, { startIso: '2027-06-02T03:00:00Z' })

    await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: chosen.id,
    })

    expect(await statusOf(overlapping.id)).toBe('REJECTED_CONFLICT')
    expect(await statusOf(adjacent.id)).toBe('PENDING')
  })

  it('兩個併發確認最多只有一個成功（規格 §14.4）', async () => {
    const ctx = await createWorkspace()

    const a = await createPending(ctx, { name: '學生A' })
    const b = await createPending(ctx, { name: '學生B' })

    const [resultA, resultB] = await Promise.all([
      confirmInquiry({ workspaceId: ctx.workspaceId, userId: ctx.userId, inquiryId: a.id }),
      confirmInquiry({ workspaceId: ctx.workspaceId, userId: ctx.userId, inquiryId: b.id }),
    ])

    const succeeded = [resultA, resultB].filter((r) => r.ok)
    expect(succeeded).toHaveLength(1)

    // 資料庫最終狀態一致：剛好一筆 CONFIRMED
    const confirmed = await db
      .select({ id: bookingInquiries.id })
      .from(bookingInquiries)
      .where(
        and(
          eq(bookingInquiries.instructorId, ctx.instructorId),
          eq(bookingInquiries.status, 'CONFIRMED'),
        ),
      )

    expect(confirmed).toHaveLength(1)
  })

  it('五個併發確認同樣只有一個成功', async () => {
    const ctx = await createWorkspace()

    const inquiries = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createPending(ctx, { startIso: '2027-06-03T02:00:00Z', name: `學生${i}` }),
      ),
    )

    const results = await Promise.all(
      inquiries.map((inquiry) =>
        confirmInquiry({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          inquiryId: inquiry.id,
        }),
      ),
    )

    expect(results.filter((r) => r.ok)).toHaveLength(1)

    const confirmed = await db
      .select({ id: bookingInquiries.id })
      .from(bookingInquiries)
      .where(
        and(
          eq(bookingInquiries.instructorId, ctx.instructorId),
          eq(bookingInquiries.status, 'CONFIRMED'),
        ),
      )

    expect(confirmed).toHaveLength(1)
  })

  it('已離開待確認的查詢不能再處理（規格 §10.1）', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx)

    await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
    })

    const second = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
    })

    expect(second.ok).toBe(false)

    const rejected = await rejectInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
      reason: '想改為拒絕',
    })

    expect(rejected.ok).toBe(false)
    expect(await statusOf(inquiry.id)).toBe('CONFIRMED')
  })

  it('已過去的時段不可確認（規格 §11.6）', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx, { startIso: '2020-01-01T02:00:00Z' })

    const result = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
    })

    expect(result.ok).toBe(false)
    expect(await statusOf(inquiry.id)).toBe('PENDING')
  })

  it('不能處理其他 workspace 的查詢', async () => {
    const mine = await createWorkspace()
    const theirs = await createWorkspace()
    const inquiry = await createPending(theirs)

    const result = await confirmInquiry({
      workspaceId: mine.workspaceId,
      userId: mine.userId,
      inquiryId: inquiry.id,
    })

    expect(result).toEqual({ ok: false, error: '找不到指定的查詢' })
    expect(await statusOf(inquiry.id)).toBe('PENDING')
  })

  it('不同老師在同一時間各自確認互不影響', async () => {
    const a = await createWorkspace()
    const b = await createWorkspace()

    const inquiryA = await createPending(a, { startIso: '2027-07-01T02:00:00Z' })
    const inquiryB = await createPending(b, { startIso: '2027-07-01T02:00:00Z' })

    const [resultA, resultB] = await Promise.all([
      confirmInquiry({ workspaceId: a.workspaceId, userId: a.userId, inquiryId: inquiryA.id }),
      confirmInquiry({ workspaceId: b.workspaceId, userId: b.userId, inquiryId: inquiryB.id }),
    ])

    expect(resultA.ok).toBe(true)
    expect(resultB.ok).toBe(true)
  })
})

describe('取消已確認預約', () => {
  it('取消後寫入 audit 事件並釋放原本時段', async () => {
    const ctx = await createWorkspace()
    const original = await createPending(ctx, { startIso: '2027-07-01T02:00:00Z' })

    await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: original.id,
    })

    const cancelled = await cancelConfirmedInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: original.id,
      reason: '老師臨時有事',
    })

    expect(cancelled).toEqual({ ok: true, conflictCount: 0 })
    expect(await statusOf(original.id)).toBe('CANCELLED')

    const events = await db
      .select()
      .from(inquiryStatusEvents)
      .where(eq(inquiryStatusEvents.bookingInquiryId, original.id))

    expect(events.map((event) => event.toStatus)).toEqual(['CONFIRMED', 'CANCELLED'])
    expect(events[1]!.reason).toBe('老師臨時有事')

    // partial exclusion constraint 只涵蓋 CONFIRMED；取消後同一時間可以再次確認。
    const replacement = await createPending(ctx, { startIso: '2027-07-01T02:00:00Z' })
    const reconfirmed = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: replacement.id,
    })

    expect(reconfirmed.ok).toBe(true)
    expect(await statusOf(replacement.id)).toBe('CONFIRMED')
  })

  it('待處理查詢不能直接取消', async () => {
    const ctx = await createWorkspace()
    const pending = await createPending(ctx, { startIso: '2027-07-02T02:00:00Z' })

    const result = await cancelConfirmedInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: pending.id,
      reason: null,
    })

    expect(result.ok).toBe(false)
    expect(await statusOf(pending.id)).toBe('PENDING')
  })
})

describe('拒絕查詢', () => {
  it('轉為已拒絕並保留原因', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx)

    const result = await rejectInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
      reason: '當日臨時有事',
    })

    expect(result.ok).toBe(true)
    expect(await statusOf(inquiry.id)).toBe('REJECTED')

    const [row] = await db
      .select({ reason: bookingInquiries.rejectionReason })
      .from(bookingInquiries)
      .where(eq(bookingInquiries.id, inquiry.id))

    expect(row!.reason).toBe('當日臨時有事')

    const events = await db
      .select({
        fromStatus: inquiryStatusEvents.fromStatus,
        toStatus: inquiryStatusEvents.toStatus,
        actorType: inquiryStatusEvents.actorType,
        reason: inquiryStatusEvents.reason,
      })
      .from(inquiryStatusEvents)
      .where(eq(inquiryStatusEvents.bookingInquiryId, inquiry.id))

    expect(events).toEqual([
      {
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        actorType: 'USER',
        reason: '當日臨時有事',
      },
    ])
  })

  it('拒絕不會佔用時段，其他人仍可被確認', async () => {
    const ctx = await createWorkspace()

    const a = await createPending(ctx, { name: '學生A' })
    const b = await createPending(ctx, { name: '學生B' })

    await rejectInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: a.id,
      reason: null,
    })

    const result = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: b.id,
    })

    expect(result.ok).toBe(true)
  })
})

describe('過期查詢收斂', () => {
  it('待處理數量與 inbox 即使沒有排程也不包含已過時間的查詢', async () => {
    const ctx = await createWorkspace()
    const expired = await createPending(ctx, { startIso: '2020-01-01T02:00:00Z' })
    const future = await createPending(ctx, { startIso: '2099-01-01T02:00:00Z' })

    expect(await countPendingInquiries(ctx.workspaceId)).toBe(1)

    const pending = await listInquiries({ workspaceId: ctx.workspaceId, status: 'PENDING' })
    expect(pending.map((inquiry) => inquiry.id)).toEqual([future.id])

    const all = await listInquiries({ workspaceId: ctx.workspaceId, status: 'ALL' })
    expect(all.find((inquiry) => inquiry.id === expired.id)?.status).toBe('EXPIRED')
  })

  it('只為本次收斂的查詢建立一次 EXPIRED audit event', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx, { startIso: '2020-01-01T02:00:00Z' })

    expect(await reconcileExpiredInquiries()).toBeGreaterThanOrEqual(1)
    expect(await reconcileExpiredInquiries()).toBe(0)
    expect(await statusOf(inquiry.id)).toBe('EXPIRED')

    const events = await db
      .select({ toStatus: inquiryStatusEvents.toStatus, actorType: inquiryStatusEvents.actorType })
      .from(inquiryStatusEvents)
      .where(eq(inquiryStatusEvents.bookingInquiryId, inquiry.id))

    expect(events).toEqual([{ toStatus: 'EXPIRED', actorType: 'SYSTEM' }])
  })

  it('資料庫 reconciliation function 重跑不會重複建立 EXPIRED event', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx, { startIso: '2020-02-01T02:00:00Z' })

    const first = await db.execute<{ affected: number }>(
      sql`select reconcile_expired_inquiries() as affected`,
    )
    const second = await db.execute<{ affected: number }>(
      sql`select reconcile_expired_inquiries() as affected`,
    )

    expect(first[0]?.affected).toBeGreaterThanOrEqual(1)
    expect(second[0]?.affected).toBe(0)

    const events = await db
      .select({ toStatus: inquiryStatusEvents.toStatus, actorType: inquiryStatusEvents.actorType })
      .from(inquiryStatusEvents)
      .where(eq(inquiryStatusEvents.bookingInquiryId, inquiry.id))

    expect(events).toEqual([{ toStatus: 'EXPIRED', actorType: 'SYSTEM' }])
  })
})

describe('學生狀態頁的 token 存取', () => {
  it('正確 token 取得該筆查詢', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx, { name: '陳小明' })

    const view = await getInquiryByStatusToken(inquiry.token)

    expect(view).not.toBeNull()
    expect(view!.status).toBe('PENDING')
    expect(view!.startAt.getTime()).toBe(inquiry.startAt.getTime())
  })

  it('錯誤或不存在的 token 回傳 null（呼叫端顯示一般化 404）', async () => {
    expect(await getInquiryByStatusToken(generateStatusToken())).toBeNull()
    expect(await getInquiryByStatusToken('不是-合法-token')).toBeNull()
    expect(await getInquiryByStatusToken('')).toBeNull()
  })

  it('聯絡方式經遮罩，不完整顯示', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx)

    const view = await getInquiryByStatusToken(inquiry.token)

    expect(view!.maskedContact).not.toBe('student@example.com')
    expect(view!.maskedContact).toContain('*')
  })

  it('確認後狀態頁反映最新結果', async () => {
    const ctx = await createWorkspace()
    const inquiry = await createPending(ctx)

    await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId: inquiry.id,
    })

    const view = await getInquiryByStatusToken(inquiry.token)
    expect(view!.status).toBe('CONFIRMED')
  })
})

describe('提交的冪等性（規格 §8.7）', () => {
  it('相同 idempotency key 不會產生第二筆', async () => {
    const ctx = await createWorkspace()
    const startAt = new Date('2027-08-01T02:00:00Z')
    const key = randomUUID()

    const values = {
      workspaceId: ctx.workspaceId,
      instructorId: ctx.instructorId,
      serviceId: ctx.serviceId,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      studentName: '重複提交的學生',
      studentEmail: 'dup@example.com',
      privacyConsentAt: new Date(),
      idempotencyKey: key,
    }

    await db
      .insert(bookingInquiries)
      .values({ ...values, statusTokenHash: hashStatusToken(generateStatusToken()) })

    await expect(
      db
        .insert(bookingInquiries)
        .values({ ...values, statusTokenHash: hashStatusToken(generateStatusToken()) }),
    ).rejects.toBeDefined()

    const rows = await db
      .select({ id: bookingInquiries.id })
      .from(bookingInquiries)
      .where(
        and(
          eq(bookingInquiries.instructorId, ctx.instructorId),
          eq(bookingInquiries.idempotencyKey, key),
        ),
      )

    expect(rows).toHaveLength(1)
  })
})
