import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { addDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

import { generateRandomSlug } from '@/lib/slug'
import { generateIdempotencyKey, generateStatusToken, hashStatusToken } from '@/lib/token'
import { zonedWallClockToUtc } from '@/lib/time'
import { isInviteTestingMode } from '@/server/app-config'
import { db } from '@/server/db'
import {
  availabilityRules,
  availabilityExceptions,
  bookingInquiries,
  inquiryStatusEvents,
  instructorProfiles,
  services,
  students,
  users,
  workspaceMembers,
  workspaces,
} from '@/server/db/schema'

const DEFAULT_TIMEZONE = 'Asia/Hong_Kong'
const SLUG_ATTEMPTS = 10
const DEFAULT_OPEN_TIME = '09:00'
const DEFAULT_CLOSE_TIME = '21:00'
const EXPERIENCE_VERSION = 'tester-v1'
const DEMO_NAMES = ['John', '陳同學', '李同學', '王同學', 'Amy', 'Chris', '黃同學', '林同學', '張同學', '何同學', 'Kelly', 'Sam'] as const

/** 預設服務，讓老師註冊後可直接開時段，不必先想服務怎麼設（docs/DESIGN.md §8）。 */
const DEFAULT_SERVICE = { name: '60 分鐘私人課', durationMinutes: 60 } as const

/** transaction callback 收到的 handle，與 db 本身型別不同（沒有 $client）。 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type BootstrapResult = {
  userId: string
  workspaceId: string
  instructorProfileId: string
  /** true 代表這次呼叫實際建立了 workspace；false 代表沿用既有的。 */
  created: boolean
}

/** 由 email 推導預設顯示名稱，例如 amy.chan@example.com → amy.chan */
function defaultDisplayName(email: string): string {
  const localPart = email.split('@')[0]?.trim()
  return localPart && localPart.length > 0 ? localPart : '老師'
}

/** 取一個尚未被使用的隨機 slug。 */
async function pickAvailableSlug(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const candidate = generateRandomSlug()
    const [existing] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1)

    if (!existing) return candidate
  }

  throw new Error('無法產生未被使用的 workspace slug，請重試')
}

/**
 * 確保 workspace 至少有一項服務。
 *
 * 冪等：只有在完全沒有服務時才建立，因此已存在的 workspace 再次 bootstrap
 * 也會補上，而老師刪光服務後不會被硬塞回來（他仍可自行建立）。
 */
async function ensureDefaultService(
  tx: Tx,
  params: { workspaceId: string; instructorId: string },
): Promise<string> {
  const [existing] = await tx
    .select({ id: services.id })
    .from(services)
    .where(eq(services.workspaceId, params.workspaceId))
    .limit(1)

  if (existing) return existing.id

  const [created] = await tx
    .insert(services)
    .values({
      workspaceId: params.workspaceId,
      instructorId: params.instructorId,
      name: DEFAULT_SERVICE.name,
      serviceType: 'PRIVATE',
      durationMinutes: DEFAULT_SERVICE.durationMinutes,
      status: 'ACTIVE',
      sortOrder: 0,
    })
    .returning({ id: services.id })

  if (!created) throw new Error('建立預設服務失敗')
  return created.id
}

/** 新老師預設每天 09:00–21:00 開放，之後可按自己的工作日修改。 */
async function createDefaultAvailability(
  tx: Tx,
  params: { workspaceId: string; instructorId: string },
): Promise<void> {
  await tx.insert(availabilityRules).values(
    Array.from({ length: 7 }, (_, weekday) => ({
      workspaceId: params.workspaceId,
      instructorId: params.instructorId,
      weekday,
      startTime: DEFAULT_OPEN_TIME,
      endTime: DEFAULT_CLOSE_TIME,
    })),
  )
}

/**
 * 固定體驗學生可在發出測試帳號時預先建立；首次登入亦會以同一個 bulk insert
 * 補齊，確保舊帳號或中途失敗後重試仍可安全收斂。
 */
async function ensureDemoStudents(
  tx: Tx,
  workspaceId: string,
): Promise<{ id: string; name: string; phone: string }[]> {
  const demoStudents = DEMO_NAMES.map((demoName, studentIndex) => {
    const name = `【測試】${demoName}`
    const suffix = String(studentIndex + 1).padStart(4, '0')
    return {
      workspaceId,
      displayName: name,
      phone: `+852 0000 ${suffix}`,
      normalizedPhone: `8520000${suffix}`,
    }
  })

  await tx.insert(students).values(demoStudents).onConflictDoNothing()

  const rows = await tx
    .select({ id: students.id, displayName: students.displayName, phone: students.phone, normalizedPhone: students.normalizedPhone })
    .from(students)
    .where(and(
      eq(students.workspaceId, workspaceId),
      inArray(students.normalizedPhone, demoStudents.map((student) => student.normalizedPhone)),
    ))

  const byPhone = new Map(rows.map((row) => [row.normalizedPhone, row]))
  const ordered = demoStudents.map((student) => byPhone.get(student.normalizedPhone))
  if (ordered.some((student) => !student?.phone)) {
    throw new Error('建立體驗學生資料失敗')
  }

  return ordered.map((student) => ({
    id: student!.id,
    name: student!.displayName,
    phone: student!.phone!,
  }))
}

/**
 * 建立清楚標示為測試的七天體驗資料。
 *
 * 只在新 workspace 建立一次；時間刻意分散且落在預設開放時間內，讓老師登入後
 * 可以立即試用「處理查詢」和「查看已確認課堂」兩條主要流程。
 */
async function createDemoBookings(
  tx: Tx,
  params: { workspaceId: string; instructorId: string; serviceId: string; userId: string; startedAt: Date },
): Promise<void> {
  const now = params.startedAt
  const dailyPendingCounts = [3, 1, 5, 2, 4, 3, 2]
  const dailyConfirmedCounts = [2, 2, 3, 1, 3, 2, 2, 3, 2, 2, 3, 2, 2, 1]
  const targetRecordCounts = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 10, 9]
  const futureRecordCounts = [7, 6, 6, 5, 5, 4, 3, 2, 1, 1, 5, 5]

  const remaining = [...futureRecordCounts]
  const futureStudentOrder: number[] = []
  while (futureStudentOrder.length < 50) {
    remaining.forEach((count, studentIndex) => {
      if (count > 0) {
        futureStudentOrder.push(studentIndex)
        remaining[studentIndex] = count - 1
      }
    })
  }

  const pendingRows = dailyPendingCounts.flatMap((count, dayIndex) =>
    Array.from({ length: count }, (_, item) => ({
      daysFromNow: dayIndex + 1,
      startTime: dayIndex === 1 && item < 2
        ? '10:00'
        : dayIndex === 3 && item === 0
          ? '18:00'
          : `${String(9 + item).padStart(2, '0')}:00`,
      status: 'PENDING' as const,
    })),
  )
  const confirmedRows = dailyConfirmedCounts.flatMap((count, dayIndex) =>
    Array.from({ length: count }, (_, item) => ({
      daysFromNow: dayIndex + 1,
      startTime: dayIndex === 3 && item === 0
        ? '18:00'
        : `${String(14 + item).padStart(2, '0')}:00`,
      status: 'CONFIRMED' as const,
    })),
  )
  const demoRows = [...pendingRows, ...confirmedRows].map((row, index) => ({
    ...row,
    studentIndex: futureStudentOrder[index]!,
  }))

  const demoStudents = await ensureDemoStudents(tx, params.workspaceId)

  const values: (typeof bookingInquiries.$inferInsert)[] = []
  for (const demo of demoRows) {
    const localDate = formatInTimeZone(addDays(now, demo.daysFromNow), DEFAULT_TIMEZONE, 'yyyy-MM-dd')
    const startAt = zonedWallClockToUtc(localDate, demo.startTime, DEFAULT_TIMEZONE)
    const endAt = new Date(startAt.getTime() + DEFAULT_SERVICE.durationMinutes * 60_000)
    const decided = demo.status === 'CONFIRMED'
    const student = demoStudents[demo.studentIndex]!

    values.push({
      workspaceId: params.workspaceId,
      instructorId: params.instructorId,
      serviceId: params.serviceId,
      studentId: student.id,
      startAt,
      endAt,
      studentName: student.name,
      studentEmail: null,
      studentPhone: student.phone,
      studentNote: '這是系統建立的測試資料，可放心操作。',
      status: demo.status,
      source: 'STUDENT',
      privacyConsentAt: now,
      statusTokenHash: hashStatusToken(generateStatusToken()),
      idempotencyKey: generateIdempotencyKey(),
      submittedAt: now,
      decidedAt: decided ? now : null,
      decidedByUserId: decided ? params.userId : null,
    })
  }

  let historyIndex = 0
  for (let studentIndex = 0; studentIndex < demoStudents.length; studentIndex++) {
    const student = demoStudents[studentIndex]!
    const historyCount = targetRecordCounts[studentIndex]! - futureRecordCounts[studentIndex]!
    for (let item = 0; item < historyCount; item++) {
      const localDate = formatInTimeZone(addDays(now, -(historyIndex + 1)), DEFAULT_TIMEZONE, 'yyyy-MM-dd')
      const startAt = zonedWallClockToUtc(localDate, '11:00', DEFAULT_TIMEZONE)
      const endAt = new Date(startAt.getTime() + DEFAULT_SERVICE.durationMinutes * 60_000)
      const status = (['CONFIRMED', 'CANCELLED', 'REJECTED', 'REJECTED_CONFLICT'] as const)[historyIndex % 4]!
      values.push({
        workspaceId: params.workspaceId,
        instructorId: params.instructorId,
        serviceId: params.serviceId,
        studentId: student.id,
        startAt,
        endAt,
        studentName: student.name,
        studentEmail: null,
        studentPhone: student.phone,
        studentNote: '【測試】過往約堂紀錄',
        status,
        source: 'STUDENT',
        privacyConsentAt: now,
        statusTokenHash: hashStatusToken(generateStatusToken()),
        idempotencyKey: generateIdempotencyKey(),
        submittedAt: startAt,
        decidedAt: startAt,
        decidedByUserId: status === 'REJECTED_CONFLICT' ? null : params.userId,
        cancelledAt: status === 'CANCELLED' ? startAt : null,
        cancellationReason: status === 'CANCELLED' ? '【測試】學生臨時有事' : null,
        rejectionReason: status === 'REJECTED' ? '【測試】老師未能安排時間' : null,
      })
      historyIndex++
    }
  }

  const inserted = await tx
    .insert(bookingInquiries)
    .values(values)
    .returning({ id: bookingInquiries.id, status: bookingInquiries.status })

  await tx.insert(inquiryStatusEvents).values(
    inserted.map((inquiry) => ({
      bookingInquiryId: inquiry.id,
      fromStatus: null,
      toStatus: inquiry.status,
      actorType: 'SYSTEM' as const,
      reason: '新帳戶體驗測試資料',
    })),
  )

  const closedDate = formatInTimeZone(addDays(now, 3), DEFAULT_TIMEZONE, 'yyyy-MM-dd')
  await tx.insert(availabilityExceptions).values({
    workspaceId: params.workspaceId,
    instructorId: params.instructorId,
    date: closedDate,
    isClosed: true,
    note: '【測試】不開放，但保留已有課堂及查詢',
  })
}

/**
 * 預先配置的測試 workspace 在首次登入才建立相對日期資料。
 * Advisory lock + transaction 令 HTML/RSC 同時抵達時仍只會初始化一次。
 */
export async function initializeExperienceWorkspace(params: {
  workspaceId: string
  instructorId: string
  userId: string
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${params.workspaceId}, 0))`)

    const [workspace] = await tx
      .select({
        isExperience: workspaces.isExperience,
        experienceStartedAt: workspaces.experienceStartedAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, params.workspaceId))
      .limit(1)

    if (!workspace?.isExperience || workspace.experienceStartedAt) return false

    const startedAt = new Date()
    const serviceId = await ensureDefaultService(tx, {
      workspaceId: params.workspaceId,
      instructorId: params.instructorId,
    })

    await createDemoBookings(tx, {
      workspaceId: params.workspaceId,
      instructorId: params.instructorId,
      serviceId,
      userId: params.userId,
      startedAt,
    })

    await tx
      .update(workspaces)
      .set({ experienceVersion: EXPERIENCE_VERSION, experienceStartedAt: startedAt })
      .where(eq(workspaces.id, params.workspaceId))

    return true
  })
}

/**
 * 為首次登入的使用者建立 Personal Workspace。
 *
 * 冪等性（規格 §14.1）由兩層保證：
 * 1. transaction 內先取 advisory lock（以 auth user id 為鍵），令同一使用者的
 *    併發請求排隊，避免兩個請求同時通過「尚無 workspace」的檢查。
 *    使用 xact 版本（交易結束自動釋放），因此在 transaction pooler 下仍安全。
 * 2. 進入後重新檢查既有 membership，已存在則直接回傳，不建立第二個 workspace。
 *
 * 因此中途失敗後重試是安全的，不會產生重複 Personal Workspace。
 */
export async function bootstrapPersonalWorkspace(params: {
  authUserId: string
  email: string
}): Promise<BootstrapResult> {
  const { authUserId, email } = params

  return db.transaction(async (tx) => {
    const experienceMode = isInviteTestingMode()
    const experienceStartedAt = new Date()
    // 同一 auth user 的併發 bootstrap 在此排隊
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${authUserId}, 0))`)

    const [user] = await tx
      .insert(users)
      .values({ authUserId, email })
      .onConflictDoUpdate({
        target: users.authUserId,
        set: { email },
      })
      .returning({ id: users.id })

    if (!user) throw new Error('建立使用者失敗')

    // 已有 workspace 就沿用，不再建立
    const [existing] = await tx
      .select({
        workspaceId: workspaceMembers.workspaceId,
        instructorProfileId: instructorProfiles.id,
      })
      .from(workspaceMembers)
      .innerJoin(
        instructorProfiles,
        eq(instructorProfiles.workspaceId, workspaceMembers.workspaceId),
      )
      .where(
        and(
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.role, 'OWNER'),
          eq(workspaceMembers.status, 'ACTIVE'),
          eq(instructorProfiles.isActive, true),
        ),
      )
      .limit(1)

    if (existing) {
      // 已存在的 workspace 也補上預設服務，讓 Phase 1 建立的帳號同樣可用
      await ensureDefaultService(tx, {
        workspaceId: existing.workspaceId,
        instructorId: existing.instructorProfileId,
      })

      return {
        userId: user.id,
        workspaceId: existing.workspaceId,
        instructorProfileId: existing.instructorProfileId,
        created: false,
      }
    }

    const displayName = defaultDisplayName(email)
    const slug = await pickAvailableSlug(tx)

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        name: displayName,
        slug,
        timezone: DEFAULT_TIMEZONE,
        type: 'PERSONAL',
        // 預設服務與開放時間會在同一 transaction 建立，因此可立即分享。
        isPublic: true,
        isExperience: experienceMode,
        experienceVersion: experienceMode ? EXPERIENCE_VERSION : null,
        experienceStartedAt: null,
      })
      .returning({ id: workspaces.id })

    if (!workspace) throw new Error('建立 workspace 失敗')

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
      status: 'ACTIVE',
    })

    const [profile] = await tx
      .insert(instructorProfiles)
      .values({
        workspaceId: workspace.id,
        userId: user.id,
        displayName,
        isActive: true,
      })
      .returning({ id: instructorProfiles.id })

    if (!profile) throw new Error('建立 instructor profile 失敗')

    const serviceId = await ensureDefaultService(tx, {
      workspaceId: workspace.id,
      instructorId: profile.id,
    })

    await createDefaultAvailability(tx, {
      workspaceId: workspace.id,
      instructorId: profile.id,
    })

    if (experienceMode) {
      await createDemoBookings(tx, {
        workspaceId: workspace.id,
        instructorId: profile.id,
        serviceId,
        userId: user.id,
        startedAt: experienceStartedAt,
      })
      await tx
        .update(workspaces)
        .set({ experienceStartedAt })
        .where(eq(workspaces.id, workspace.id))
    }

    return {
      userId: user.id,
      workspaceId: workspace.id,
      instructorProfileId: profile.id,
      created: true,
    }
  })
}
