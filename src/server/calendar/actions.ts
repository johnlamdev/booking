'use server'

import { and, count, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { addDays } from '@/lib/availability'
import { generateStatusToken, hashStatusToken } from '@/lib/token'
import { isValidDateString, isValidTimeString, zonedWallClockToUtc } from '@/lib/time'
import { db } from '@/server/db'
import {
  availabilityExceptions,
  bookingInquiries,
  inquiryStatusEvents,
  services,
  students,
} from '@/server/db/schema'
import { requireWorkspaceContext } from '@/server/workspace/context'
import { syncGoogleCalendarBookingSafely } from '@/server/calendar/google'

export type CalendarActionState = {
  error?: string
  success?: string
  warning?: string
  requiresConfirmation?: boolean
  confirmationKey?: string
} | null

const manualBookingSchema = z.object({
  date: z.string().refine(isValidDateString, '日期格式不正確'),
  time: z
    .string()
    .refine(isValidTimeString, '時間格式不正確')
    .refine((value) => value.endsWith(':00'), '第一版只接受整點開始'),
  serviceId: z.string().uuid('請選擇課堂'),
  studentId: z.string().uuid('請選擇學生'),
})

function revalidateCalendar() {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/inquiries')
}

export async function createManualBookingAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const ctx = await requireWorkspaceContext()
  const parsed = manualBookingSchema.safeParse({
    date: String(formData.get('date') ?? ''),
    time: String(formData.get('time') ?? ''),
    serviceId: String(formData.get('serviceId') ?? ''),
    studentId: String(formData.get('studentId') ?? ''),
  })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '輸入內容不正確' }

  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.id, parsed.data.serviceId),
        eq(services.workspaceId, ctx.workspaceId),
        eq(services.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!service) return { error: '這項課堂已停用，請選擇其他課堂。' }

  const [student] = await db
    .select({
      id: students.id,
      displayName: students.displayName,
      phone: students.phone,
    })
    .from(students)
    .where(
      and(
        eq(students.id, parsed.data.studentId),
        eq(students.workspaceId, ctx.workspaceId),
        isNull(students.archivedAt),
      ),
    )
    .limit(1)

  if (!student) return { error: '找不到這位學生，請重新選擇。' }
  if (!student.phone) return { error: '這位學生未有 WhatsApp 號碼，請先更新學生資料。' }

  const startAt = zonedWallClockToUtc(parsed.data.date, parsed.data.time, ctx.timezone)
  const endAt = new Date(startAt.getTime() + 60 * 60_000)
  if (startAt <= new Date()) return { error: '不可新增已經開始或過去的課堂。' }

  try {
    const { conflictCount, createdId } = await db.transaction(async (tx) => {
      const token = generateStatusToken()
      const [created] = await tx
        .insert(bookingInquiries)
        .values({
          workspaceId: ctx.workspaceId,
          instructorId: ctx.instructorProfileId,
          serviceId: service.id,
          studentId: student.id,
          startAt,
          endAt,
          studentName: student.displayName,
          studentEmail: null,
          studentPhone: student.phone,
          studentNote: null,
          status: 'CONFIRMED',
          source: 'INSTRUCTOR',
          privacyConsentAt: null,
          statusTokenHash: hashStatusToken(token),
          idempotencyKey: `manual-${generateStatusToken()}`,
          decidedAt: new Date(),
          decidedByUserId: ctx.userId,
          createdByUserId: ctx.userId,
        })
        .returning({ id: bookingInquiries.id })

      if (!created) throw new Error('manual booking insert returned no row')

      await tx.insert(inquiryStatusEvents).values({
        bookingInquiryId: created.id,
        fromStatus: null,
        toStatus: 'CONFIRMED',
        actorType: 'USER',
        actorUserId: ctx.userId,
      })

      const conflicts = await tx
        .update(bookingInquiries)
        .set({ status: 'REJECTED_CONFLICT', decidedAt: new Date() })
        .where(
          and(
            eq(bookingInquiries.instructorId, ctx.instructorProfileId),
            eq(bookingInquiries.status, 'PENDING'),
            ne(bookingInquiries.id, created.id),
            sql`tstzrange(${bookingInquiries.startAt}, ${bookingInquiries.endAt}, '[)')
                && tstzrange(${startAt.toISOString()}::timestamptz, ${endAt.toISOString()}::timestamptz, '[)')`,
          ),
        )
        .returning({ id: bookingInquiries.id })

      if (conflicts.length > 0) {
        await tx.insert(inquiryStatusEvents).values(
          conflicts.map((conflict) => ({
            bookingInquiryId: conflict.id,
            fromStatus: 'PENDING' as const,
            toStatus: 'REJECTED_CONFLICT' as const,
            actorType: 'SYSTEM' as const,
          })),
        )
      }

      return { conflictCount: conflicts.length, createdId: created.id }
    })

    revalidateCalendar()
    await syncGoogleCalendarBookingSafely(createdId)
    return {
      success:
        conflictCount > 0
          ? `課堂已加入；同時段 ${conflictCount} 筆待確認查詢已標記為時段衝突。`
          : '課堂已加入日曆。',
    }
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ??
      (error as { cause?: { code?: string } }).cause?.code
    if (code === '23P01') return { error: '這個時段已有已確認課堂。' }
    console.error(`[calendar] manual booking failed code=${code ?? 'unknown'}`)
    return { error: '暫時未能新增課堂，請稍後再試。' }
  }
}

const timeOffSchema = z
  .object({
    startDate: z.string().refine(isValidDateString, '開始日期格式不正確'),
    endDate: z.string().refine(isValidDateString, '結束日期格式不正確'),
    note: z.string().trim().max(120, '備註不可超過 120 個字元'),
  })
  .refine((value) => value.endDate >= value.startDate, '結束日期不可早於開始日期')

export async function createTimeOffAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const ctx = await requireWorkspaceContext()
  const parsed = timeOffSchema.safeParse({
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    note: String(formData.get('note') ?? ''),
  })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '輸入內容不正確' }

  const dates: string[] = []
  for (let date = parsed.data.startDate; date <= parsed.data.endDate; date = addDays(date, 1)) {
    dates.push(date)
    if (dates.length > 31) return { error: '一次最多設定 31 天不開放。' }
  }

  const rangeStart = zonedWallClockToUtc(parsed.data.startDate, '00:00', ctx.timezone)
  const rangeEnd = zonedWallClockToUtc(addDays(parsed.data.endDate, 1), '00:00', ctx.timezone)
  const [existing] = await db
    .select({ value: count() })
    .from(bookingInquiries)
    .where(and(
      eq(bookingInquiries.workspaceId, ctx.workspaceId),
      inArray(bookingInquiries.status, ['PENDING', 'CONFIRMED']),
      lt(bookingInquiries.startAt, rangeEnd),
      gt(bookingInquiries.endAt, rangeStart),
    ))
  const existingCount = existing?.value ?? 0
  const confirmationKey = `${parsed.data.startDate}:${parsed.data.endDate}`
  if (existingCount > 0 && String(formData.get('confirmExisting') ?? '') !== confirmationKey) {
    return {
      warning: `所選日期已有 ${existingCount} 項已確認課堂或待確認查詢。設為不開放只會停止新查詢，現有項目不會取消。`,
      requiresConfirmation: true,
      confirmationKey,
    }
  }

  await db
    .insert(availabilityExceptions)
    .values(
      dates.map((date) => ({
        workspaceId: ctx.workspaceId,
        instructorId: ctx.instructorProfileId,
        date,
        isClosed: true,
        startTime: null,
        endTime: null,
        note: parsed.data.note || null,
      })),
    )
    .onConflictDoUpdate({
      target: [availabilityExceptions.instructorId, availabilityExceptions.date],
      set: { isClosed: true, startTime: null, endTime: null, note: parsed.data.note || null },
    })

  revalidateCalendar()
  revalidatePath('/dashboard/availability/settings')
  return { success: dates.length === 1 ? `這天已設為不開放。${existingCount > 0 ? ` 已保留 ${existingCount} 項既有安排。` : ''}` : `已設定 ${dates.length} 天不開放。${existingCount > 0 ? ` 已保留 ${existingCount} 項既有安排。` : ''}` }
}
