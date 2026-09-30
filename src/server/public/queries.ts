import 'server-only'

import { and, asc, eq, gt, gte, inArray, lt, ne } from 'drizzle-orm'

import { deriveAvailableSlots, type DerivedSlot } from '@/lib/availability'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'
import {
  summarizeInquiryConflicts,
  type ConflictInquiry,
  type InquiryConflictSummary,
} from '@/lib/inquiry-conflicts'
import { db } from '@/server/db'
import {
  availabilityExceptions,
  availabilityRules,
  bookingInquiries,
  instructorProfiles,
  services,
  workspaces,
} from '@/server/db/schema'

/**
 * 公開頁的資料讀取。
 *
 * 只回傳老師主動公開的欄位——不含 owner 的登入 email、內部 user id、
 * membership、學生資料或 token hash（規格 §13.2）。
 */

export type PublicProfile = {
  workspaceId: string
  instructorId: string
  slug: string
  displayName: string
  bio: string | null
  contactEmail: string | null
  contactPhone: string | null
  timezone: string
  slotIntervalMinutes: number
  minNoticeMinutes: number
  bookingHorizonDays: number
}

export type PublicService = {
  id: string
  name: string
  description: string | null
  durationMinutes: number
}

/**
 * 依 slug 取得已發佈的老師公開資料。
 *
 * 未發佈（`is_public = false`）一律當作不存在，回傳 null，
 * 由呼叫端顯示一般化 404——不透露該 slug 是否已被使用。
 */
export async function getPublishedProfile(slug: string): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      workspaceId: workspaces.id,
      instructorId: instructorProfiles.id,
      slug: workspaces.slug,
      displayName: instructorProfiles.displayName,
      bio: instructorProfiles.bio,
      contactEmail: instructorProfiles.contactEmail,
      contactPhone: instructorProfiles.contactPhone,
      timezone: workspaces.timezone,
      slotIntervalMinutes: workspaces.slotIntervalMinutes,
      minNoticeMinutes: workspaces.minNoticeMinutes,
      bookingHorizonDays: workspaces.bookingHorizonDays,
    })
    .from(workspaces)
    .innerJoin(instructorProfiles, eq(instructorProfiles.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaces.slug, slug.toLowerCase()),
        eq(workspaces.isPublic, true),
        eq(instructorProfiles.isActive, true),
      ),
    )
    .limit(1)

  return row ?? null
}

/** 只供已授權的老師預覽；呼叫端必須先核對 workspace ownership。 */
export async function getWorkspacePreviewProfile(workspaceId: string): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      workspaceId: workspaces.id,
      instructorId: instructorProfiles.id,
      slug: workspaces.slug,
      displayName: instructorProfiles.displayName,
      bio: instructorProfiles.bio,
      contactEmail: instructorProfiles.contactEmail,
      contactPhone: instructorProfiles.contactPhone,
      timezone: workspaces.timezone,
      slotIntervalMinutes: workspaces.slotIntervalMinutes,
      minNoticeMinutes: workspaces.minNoticeMinutes,
      bookingHorizonDays: workspaces.bookingHorizonDays,
    })
    .from(workspaces)
    .innerJoin(instructorProfiles, eq(instructorProfiles.workspaceId, workspaces.id))
    .where(and(eq(workspaces.id, workspaceId), eq(instructorProfiles.isActive, true)))
    .limit(1)

  return row ?? null
}

/** 公開頁可選的服務：只有啟用中的才出現。 */
export async function getPublicServices(workspaceId: string): Promise<PublicService[]> {
  return db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      durationMinutes: services.durationMinutes,
    })
    .from(services)
    .where(and(eq(services.workspaceId, workspaceId), eq(services.status, 'ACTIVE')))
    .orderBy(asc(services.sortOrder), asc(services.createdAt))
}

/** 今天在指定時區的日曆日期。 */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * 推導某位老師、某項服務在未來一段時間內的可預約時段。
 *
 * 「已確認的預約」是唯一會佔用時間的資料——待確認不佔用（規格 §11.1）。
 */
export async function getAvailableSlots(params: {
  profile: PublicProfile
  durationMinutes: number
  fromDate?: string
  days?: number
  /** 改期時忽略原本這堂課，讓部分重疊的新時段也可供選擇。 */
  excludeBookingId?: string
}): Promise<DerivedSlot[]> {
  const { profile, durationMinutes } = params
  const fromDate = params.fromDate ?? todayInZone(profile.timezone)
  const days = params.days ?? profile.bookingHorizonDays

  const horizonEnd = new Date(Date.now() + (days + 1) * 86_400_000)

  const [rules, exceptions, confirmed] = await Promise.all([
    db
      .select({
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
      })
      .from(availabilityRules)
      .where(eq(availabilityRules.instructorId, profile.instructorId)),

    db
      .select({
        date: availabilityExceptions.date,
        isClosed: availabilityExceptions.isClosed,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
      })
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.instructorId, profile.instructorId),
          gte(availabilityExceptions.date, fromDate),
        ),
      ),

    db
      .select({ startAt: bookingInquiries.startAt, endAt: bookingInquiries.endAt })
      .from(bookingInquiries)
      .where(
        and(
          eq(bookingInquiries.instructorId, profile.instructorId),
          eq(bookingInquiries.status, 'CONFIRMED'),
          params.excludeBookingId ? ne(bookingInquiries.id, params.excludeBookingId) : undefined,
          gte(bookingInquiries.endAt, new Date()),
          lt(bookingInquiries.startAt, horizonEnd),
        ),
      ),
  ])

  return deriveAvailableSlots({
    fromDate,
    days,
    timeZone: profile.timezone,
    rules,
    exceptions,
    booked: confirmed,
    durationMinutes,
    slotIntervalMinutes: profile.slotIntervalMinutes,
    minNoticeMinutes: profile.minNoticeMinutes,
    now: new Date(),
  })
}

/**
 * 確認某個時間點確實可預約。
 *
 * 建立查詢前必須重新推導驗證，不能相信表單傳來的時間（規格 §11.4、§11.6）。
 */
export async function isSlotBookable(params: {
  profile: PublicProfile
  durationMinutes: number
  startAt: Date
}): Promise<boolean> {
  const { profile, durationMinutes, startAt } = params

  const slots = await getAvailableSlots({ profile, durationMinutes })

  return slots.some((slot) => slot.startAt.getTime() === startAt.getTime())
}

/** 公開頁是否還有任何可預約時段——決定要不要顯示空狀態。 */
export async function hasAnyAvailability(profile: PublicProfile): Promise<boolean> {
  const services = await getPublicServices(profile.workspaceId)
  if (services.length === 0) return false

  const shortest = Math.min(...services.map((s) => s.durationMinutes))
  const slots = await getAvailableSlots({ profile, durationMinutes: shortest, days: 14 })

  return slots.length > 0
}

/** 供發佈前檢查：至少要有一項啟用服務與一條開放規則。 */
export async function getPublishReadiness(
  workspaceId: string,
  instructorId: string,
): Promise<{ hasService: boolean; hasSchedule: boolean; hasWhatsApp: boolean }> {
  const [activeServices, rules, [profile]] = await Promise.all([
    db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.workspaceId, workspaceId), eq(services.status, 'ACTIVE')))
      .limit(1),
    db
      .select({ id: availabilityRules.id })
      .from(availabilityRules)
      .where(eq(availabilityRules.instructorId, instructorId))
      .limit(1),
    db.select({ phone: instructorProfiles.contactPhone }).from(instructorProfiles)
      .where(and(eq(instructorProfiles.id, instructorId), eq(instructorProfiles.workspaceId, workspaceId))).limit(1),
  ])

  const digits = normalizeWhatsAppNumber(profile?.phone)
  return { hasService: activeServices.length > 0, hasSchedule: rules.length > 0, hasWhatsApp: digits.length >= 8 && digits.length <= 15 }
}

export type { InquiryConflictSummary } from '@/lib/inquiry-conflicts'

/**
 * 一次取得 inbox 所有待處理查詢的衝突摘要。
 *
 * 舊做法為每張卡各查一次同一批 PENDING／CONFIRMED 課堂；體驗帳號有 20 筆
 * 待處理時便會產生 20 次重複 query。這裡先按整批目標時間收窄一次查詢，
 * 再在記憶體內計算每筆摘要。
 */
export async function getInquiryConflictSummaries(params: {
  instructorId: string
  inquiries: ConflictInquiry[]
}): Promise<Record<string, InquiryConflictSummary>> {
  const targets = params.inquiries.filter((inquiry) => inquiry.status === 'PENDING')
  if (targets.length === 0) return {}

  const earliestStart = new Date(Math.min(...targets.map((inquiry) => inquiry.startAt.getTime())))
  const latestEnd = new Date(Math.max(...targets.map((inquiry) => inquiry.endAt.getTime())))

  const rows = await db
    .select({
      id: bookingInquiries.id,
      status: bookingInquiries.status,
      startAt: bookingInquiries.startAt,
      endAt: bookingInquiries.endAt,
    })
    .from(bookingInquiries)
    .where(
      and(
        eq(bookingInquiries.instructorId, params.instructorId),
        inArray(bookingInquiries.status, ['PENDING', 'CONFIRMED']),
        lt(bookingInquiries.startAt, latestEnd),
        gt(bookingInquiries.endAt, earliestStart),
      ),
    )

  return summarizeInquiryConflicts(targets, rows)
}
