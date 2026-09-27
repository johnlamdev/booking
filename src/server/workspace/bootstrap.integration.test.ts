import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/server/db'
import {
  availabilityRules,
  availabilityExceptions,
  bookingInquiries,
  instructorProfiles,
  services,
  students,
  users,
  workspaceMembers,
  workspaces,
} from '@/server/db/schema'

import { bootstrapPersonalWorkspace, initializeExperienceWorkspace } from './bootstrap'
import { hasBootstrappedBusinessUser, loadWorkspaceContext } from './context'

/** 每個測試使用獨立的 auth user id，彼此不干擾。 */
function newAuthUser() {
  const authUserId = randomUUID()
  return { authUserId, email: `${authUserId.slice(0, 8)}@example.com` }
}

async function countWorkspacesOf(authUserId: string): Promise<number> {
  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(eq(users.authUserId, authUserId))

  return rows.length
}

afterAll(async () => {
  // postgres.js 會維持連線，測試結束後需主動關閉，否則 vitest 不會退出
  await db.$client.end({ timeout: 5 })
})

describe('bootstrapPersonalWorkspace', () => {
  it('首次呼叫建立 user、workspace、OWNER membership 及 instructor profile', async () => {
    const { authUserId, email } = newAuthUser()

    const result = await bootstrapPersonalWorkspace({ authUserId, email, isExperience: true })

    expect(result.created).toBe(true)

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, result.workspaceId))

    expect(workspace).toBeDefined()
    expect(workspace!.type).toBe('PERSONAL')
    expect(workspace!.isPublic).toBe(true)
    expect(workspace!.isExperience).toBe(true)
    expect(workspace!.experienceVersion).toBe('tester-v1')
    expect(workspace!.experienceStartedAt).toBeInstanceOf(Date)
    expect(workspace!.timezone).toBe('Asia/Hong_Kong')
    // bootstrap 產生的 slug 應為隨機且合法
    expect(workspace!.slug).toMatch(/^t-[a-z0-9]{6}$/)

    const members = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, result.workspaceId))

    expect(members).toHaveLength(1)
    expect(members[0]!.role).toBe('OWNER')
    expect(members[0]!.status).toBe('ACTIVE')

    const profiles = await db
      .select()
      .from(instructorProfiles)
      .where(eq(instructorProfiles.workspaceId, result.workspaceId))

    expect(profiles).toHaveLength(1)
    expect(profiles[0]!.isActive).toBe(true)

    const defaultServices = await db
      .select()
      .from(services)
      .where(eq(services.workspaceId, result.workspaceId))
    expect(defaultServices).toHaveLength(1)
    expect(defaultServices[0]!.name).toBe('60 分鐘私人課')

    const defaultRules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.workspaceId, result.workspaceId))
    expect(defaultRules).toHaveLength(7)
    expect(defaultRules.every((rule) => rule.startTime === '09:00:00')).toBe(true)
    expect(defaultRules.every((rule) => rule.endTime === '21:00:00')).toBe(true)

    const demoStudents = await db
      .select()
      .from(students)
      .where(eq(students.workspaceId, result.workspaceId))
    expect(demoStudents).toHaveLength(12)

    const demos = await db
      .select()
      .from(bookingInquiries)
      .where(eq(bookingInquiries.workspaceId, result.workspaceId))
    expect(demos).toHaveLength(74)
    expect(demos.filter((demo) => demo.status === 'PENDING')).toHaveLength(20)
    expect(demos.filter((demo) => demo.status === 'CONFIRMED')).toHaveLength(36)
    expect(demos.filter((demo) => demo.status === 'CONFIRMED' && demo.startAt > workspace!.experienceStartedAt!)).toHaveLength(30)
    expect(demos.filter((demo) => demo.status === 'CANCELLED')).toHaveLength(6)
    expect(demos.filter((demo) => demo.status === 'REJECTED')).toHaveLength(6)
    expect(demos.filter((demo) => demo.status === 'REJECTED_CONFLICT')).toHaveLength(6)
    expect(demos.every((demo) => demo.studentName.includes('測試'))).toBe(true)
    expect(demos.every((demo) => demo.studentNote?.includes('測試'))).toBe(true)

    const recordsPerStudent = await db
      .select({ studentId: bookingInquiries.studentId, count: sql<number>`count(*)::int` })
      .from(bookingInquiries)
      .where(eq(bookingInquiries.workspaceId, result.workspaceId))
      .groupBy(bookingInquiries.studentId)
    expect(recordsPerStudent).toHaveLength(12)
    expect(Math.min(...recordsPerStudent.map((row) => row.count))).toBe(1)
    expect(Math.max(...recordsPerStudent.map((row) => row.count))).toBe(10)

    const demoExceptions = await db.select().from(availabilityExceptions).where(eq(availabilityExceptions.workspaceId, result.workspaceId))
    expect(demoExceptions).toHaveLength(1)
    expect(demoExceptions[0]).toMatchObject({ isClosed: true })
  })

  it('一般新帳號不建立測試學生或預約紀錄', async () => {
    const { authUserId, email } = newAuthUser()
    const result = await bootstrapPersonalWorkspace({ authUserId, email })
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, result.workspaceId))
    const studentRows = await db.select().from(students).where(eq(students.workspaceId, result.workspaceId))
    const bookingRows = await db.select().from(bookingInquiries).where(eq(bookingInquiries.workspaceId, result.workspaceId))

    expect(workspace?.isExperience).toBe(false)
    expect(workspace?.experienceVersion).toBeNull()
    expect(studentRows).toHaveLength(0)
    expect(bookingRows).toHaveLength(0)
  })

  it('重複呼叫不會產生第二個 workspace（規格 §14.1）', async () => {
    const { authUserId, email } = newAuthUser()

    const first = await bootstrapPersonalWorkspace({ authUserId, email })
    const second = await bootstrapPersonalWorkspace({ authUserId, email })
    const third = await bootstrapPersonalWorkspace({ authUserId, email })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(third.created).toBe(false)

    expect(second.workspaceId).toBe(first.workspaceId)
    expect(third.workspaceId).toBe(first.workspaceId)
    expect(await countWorkspacesOf(authUserId)).toBe(1)
  })

  it('併發呼叫最多只建立一個 workspace', async () => {
    const { authUserId, email } = newAuthUser()

    // 模擬使用者連點或多個請求同時抵達
    const results = await Promise.all(
      Array.from({ length: 8 }, () => bootstrapPersonalWorkspace({ authUserId, email })),
    )

    const workspaceIds = new Set(results.map((r) => r.workspaceId))
    expect(workspaceIds.size).toBe(1)

    // 只有一個請求真正建立，其餘沿用
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(await countWorkspacesOf(authUserId)).toBe(1)
  })

  it('預先建立固定資料後，併發首次登入只會建立一份相對日期資料', async () => {
    const { authUserId, email } = newAuthUser()
    const result = await bootstrapPersonalWorkspace({ authUserId, email, isExperience: true })

    // 模擬管理員已預先建立 workspace／學生，但老師尚未首次登入。
    await db.delete(bookingInquiries).where(eq(bookingInquiries.workspaceId, result.workspaceId))
    await db.delete(availabilityExceptions).where(eq(availabilityExceptions.workspaceId, result.workspaceId))
    await db
      .update(workspaces)
      .set({ experienceStartedAt: null })
      .where(eq(workspaces.id, result.workspaceId))

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => initializeExperienceWorkspace({
        workspaceId: result.workspaceId,
        instructorId: result.instructorProfileId,
        userId: result.userId,
      })),
    )

    expect(outcomes.filter(Boolean)).toHaveLength(1)

    const demoStudents = await db.select().from(students).where(eq(students.workspaceId, result.workspaceId))
    const demos = await db.select().from(bookingInquiries).where(eq(bookingInquiries.workspaceId, result.workspaceId))
    const exceptions = await db.select().from(availabilityExceptions).where(eq(availabilityExceptions.workspaceId, result.workspaceId))
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, result.workspaceId))

    expect(demoStudents).toHaveLength(12)
    expect(demos).toHaveLength(74)
    expect(exceptions).toHaveLength(1)
    expect(workspace?.experienceStartedAt).toBeInstanceOf(Date)
  })

  it('email 變更時更新既有 user，不會建立重複 user', async () => {
    const { authUserId, email } = newAuthUser()

    const first = await bootstrapPersonalWorkspace({ authUserId, email })
    const second = await bootstrapPersonalWorkspace({
      authUserId,
      email: 'changed@example.com',
    })

    expect(second.userId).toBe(first.userId)

    const rows = await db.select().from(users).where(eq(users.authUserId, authUserId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('changed@example.com')
  })

  it('不同使用者各自取得獨立的 workspace 與 slug', async () => {
    const a = newAuthUser()
    const b = newAuthUser()

    const resultA = await bootstrapPersonalWorkspace(a)
    const resultB = await bootstrapPersonalWorkspace(b)

    expect(resultA.workspaceId).not.toBe(resultB.workspaceId)
    expect(resultA.instructorProfileId).not.toBe(resultB.instructorProfileId)

    const [wsA] = await db.select().from(workspaces).where(eq(workspaces.id, resultA.workspaceId))
    const [wsB] = await db.select().from(workspaces).where(eq(workspaces.id, resultB.workspaceId))
    expect(wsA!.slug).not.toBe(wsB!.slug)
  })
})

describe('loadWorkspaceContext 的資料隔離', () => {
  it('只回傳自己的 workspace，看不到其他使用者的（規格 §14.1）', async () => {
    const a = newAuthUser()
    const b = newAuthUser()

    const resultA = await bootstrapPersonalWorkspace(a)
    const resultB = await bootstrapPersonalWorkspace(b)

    const ctxA = await loadWorkspaceContext(a.authUserId)
    const ctxB = await loadWorkspaceContext(b.authUserId)

    expect(ctxA?.workspaceId).toBe(resultA.workspaceId)
    expect(ctxB?.workspaceId).toBe(resultB.workspaceId)

    // 關鍵：A 的 context 絕不可帶出 B 的任何識別碼
    expect(ctxA?.workspaceId).not.toBe(resultB.workspaceId)
    expect(ctxA?.instructorProfileId).not.toBe(resultB.instructorProfileId)
    expect(ctxA?.userId).not.toBe(ctxB?.userId)
  })

  it('未 bootstrap 的 auth user 取得 null，不會落到別人的 workspace', async () => {
    const stranger = randomUUID()
    await expect(loadWorkspaceContext(stranger)).resolves.toBeNull()
    await expect(hasBootstrappedBusinessUser(stranger)).resolves.toBe(false)
  })

  it('membership 被停用後即失去 workspace 存取權', async () => {
    const { authUserId, email } = newAuthUser()
    const result = await bootstrapPersonalWorkspace({ authUserId, email })

    expect(await loadWorkspaceContext(authUserId)).not.toBeNull()

    await db
      .update(workspaceMembers)
      .set({ status: 'DISABLED' })
      .where(eq(workspaceMembers.workspaceId, result.workspaceId))

    expect(await loadWorkspaceContext(authUserId)).toBeNull()
    // requireWorkspaceContext 會據此導向停權頁，而不是重新建立一個 workspace。
    expect(await hasBootstrappedBusinessUser(authUserId)).toBe(true)
  })
})
