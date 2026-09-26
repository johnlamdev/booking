'use server'

import { revalidatePath } from 'next/cache'
import { and, count, eq, gt, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'

import { hasOverlappingWallClockRanges, timeToMinutes } from '@/lib/availability'
import { isValidDateString, isValidTimeString, zonedWallClockToUtc } from '@/lib/time'
import { db } from '@/server/db'
import { availabilityExceptions, availabilityRules, bookingInquiries, workspaces } from '@/server/db/schema'
import { requireWorkspaceContext } from '@/server/workspace/context'

export type ScheduleFormState = { error?: string; success?: boolean; warning?: string; requiresConfirmation?: boolean; confirmationKey?: string } | null

const timeString = z.string().refine(isValidTimeString, '時間格式不正確')

const rangeSchema = z
  .object({ startTime: timeString, endTime: timeString })
  .refine((r) => r.startTime.endsWith(':00') && r.endTime.endsWith(':00'), {
    message: '第一版只接受整點時間',
  })
  .refine((r) => timeToMinutes(r.endTime) > timeToMinutes(r.startTime), {
    message: '結束時間必須晚於開始時間',
  })

const weeklyScheduleSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    ranges: z.array(rangeSchema),
  }),
)

function revalidate() {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/availability')
}

/**
 * 以整份取代的方式儲存每週時間表。
 *
 * 用「刪除後重建」而非逐列 diff：規則沒有需要保留的歷史（不像預約），
 * 整份取代的語義簡單得多，也不會出現部分套用的中間狀態。
 */
export async function saveWeeklyScheduleAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const ctx = await requireWorkspaceContext()

  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('schedule') ?? '[]'))
  } catch {
    return { error: '時間表格式不正確' }
  }

  const parsed = weeklyScheduleSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '時間表格式不正確' }
  }

  // 同一 weekday 即使被手工 payload 拆成多個項目，也必須合併後驗證。
  for (let weekday = 0; weekday <= 6; weekday++) {
    const ranges = parsed.data
      .filter((day) => day.weekday === weekday)
      .flatMap((day) => day.ranges)

    if (hasOverlappingWallClockRanges(ranges)) {
      return { error: '同一天的開放時間不可互相重疊，請調整後再儲存。' }
    }
  }

  const rows = parsed.data.flatMap((day) =>
    day.ranges.map((range) => ({
      workspaceId: ctx.workspaceId,
      instructorId: ctx.instructorProfileId,
      weekday: day.weekday,
      startTime: range.startTime,
      endTime: range.endTime,
    })),
  )

  await db.transaction(async (tx) => {
    await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.instructorId, ctx.instructorProfileId))

    if (rows.length > 0) await tx.insert(availabilityRules).values(rows)
  })

  revalidate()
  return { success: true }
}

const exceptionSchema = z
  .object({
    date: z.string().refine(isValidDateString, '日期格式不正確'),
    isClosed: z.boolean(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    note: z.string().trim().max(120, '備註不可超過 120 個字元').optional(),
  })
  .refine(
    (e) =>
      e.isClosed ||
      (!!e.startTime &&
        !!e.endTime &&
        isValidTimeString(e.startTime) &&
        isValidTimeString(e.endTime) &&
        e.startTime.endsWith(':00') &&
        e.endTime.endsWith(':00') &&
        timeToMinutes(e.endTime) > timeToMinutes(e.startTime)),
    { message: '設定特別時間時，結束時間必須晚於開始時間' },
  )

/** 新增或覆蓋某一天的日期覆寫。同一日期只保留一筆。 */
export async function saveExceptionAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const ctx = await requireWorkspaceContext()

  const isClosed = formData.get('mode') !== 'CUSTOM'

  const parsed = exceptionSchema.safeParse({
    date: String(formData.get('date') ?? ''),
    isClosed,
    startTime: String(formData.get('startTime') ?? '') || undefined,
    endTime: String(formData.get('endTime') ?? '') || undefined,
    note: String(formData.get('note') ?? '') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '輸入內容不正確' }
  }

  if (parsed.data.isClosed) {
    const rangeStart = zonedWallClockToUtc(parsed.data.date, '00:00', ctx.timezone)
    const nextDate = new Date(`${parsed.data.date}T00:00:00Z`)
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
    const endDate = nextDate.toISOString().slice(0, 10)
    const rangeEnd = zonedWallClockToUtc(endDate, '00:00', ctx.timezone)
    const [existing] = await db.select({ value: count() }).from(bookingInquiries).where(and(
      eq(bookingInquiries.workspaceId, ctx.workspaceId),
      inArray(bookingInquiries.status, ['PENDING', 'CONFIRMED']),
      lt(bookingInquiries.startAt, rangeEnd),
      gt(bookingInquiries.endAt, rangeStart),
    ))
    const existingCount = existing?.value ?? 0
    if (existingCount > 0 && String(formData.get('confirmExisting') ?? '') !== parsed.data.date) {
      return { warning: `這天已有 ${existingCount} 項已確認課堂或待確認查詢。設為不開放只會停止新查詢，現有項目不會取消。`, requiresConfirmation: true, confirmationKey: parsed.data.date }
    }
  }

  const values = {
    workspaceId: ctx.workspaceId,
    instructorId: ctx.instructorProfileId,
    date: parsed.data.date,
    isClosed: parsed.data.isClosed,
    // check constraint 要求休假時兩個時間欄位皆為 null
    startTime: parsed.data.isClosed ? null : (parsed.data.startTime ?? null),
    endTime: parsed.data.isClosed ? null : (parsed.data.endTime ?? null),
    note: parsed.data.note ?? null,
  }

  await db
    .insert(availabilityExceptions)
    .values(values)
    .onConflictDoUpdate({
      target: [availabilityExceptions.instructorId, availabilityExceptions.date],
      set: {
        isClosed: values.isClosed,
        startTime: values.startTime,
        endTime: values.endTime,
        note: values.note,
      },
    })

  revalidate()
  return { success: true }
}

export async function deleteExceptionAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspaceContext()

  const id = String(formData.get('exceptionId') ?? '')
  if (!id) return

  await db
    .delete(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.id, id),
        // 一併以 workspaceId 限定，避免透過改動表單刪到別人的資料
        eq(availabilityExceptions.workspaceId, ctx.workspaceId),
      ),
    )

  revalidate()
}

const settingsSchema = z.object({
  slotIntervalMinutes: z.number().int().min(5).max(120),
  minNoticeMinutes: z.number().int().min(0).max(10_080),
  bookingHorizonDays: z.number().int().min(1).max(365),
})

export async function updateSchedulingSettingsAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const ctx = await requireWorkspaceContext()

  const parsed = settingsSchema.safeParse({
    slotIntervalMinutes: Number(formData.get('slotIntervalMinutes')),
    minNoticeMinutes: Number(formData.get('minNoticeMinutes')),
    bookingHorizonDays: Number(formData.get('bookingHorizonDays')),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '設定值不正確' }
  }

  await db
    .update(workspaces)
    .set({
      ...parsed.data,
      // 研究版刻意收窄為整點開始；底層欄位保留，日後可按回饋重新開放。
      slotIntervalMinutes: 60,
    })
    .where(eq(workspaces.id, ctx.workspaceId))

  revalidate()
  return { success: true }
}
