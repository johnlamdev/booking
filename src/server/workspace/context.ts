import 'server-only'

import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { requireAuthUser } from '@/server/auth/dal'
import { getTestWhatsAppOverride, isInviteTestingMode } from '@/server/app-config'
import { db } from '@/server/db'
import { instructorProfiles, users, workspaceMembers, workspaces } from '@/server/db/schema'

import { bootstrapPersonalWorkspace, initializeExperienceWorkspace } from './bootstrap'

export type WorkspaceContext = {
  userId: string
  authUserId: string
  email: string
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  timezone: string
  isPublic: boolean
  isExperience: boolean
  experienceStartedAt: Date | null
  testWhatsAppOverride: string | null
  slotIntervalMinutes: number
  minNoticeMinutes: number
  bookingHorizonDays: number
  role: 'OWNER' | 'ADMIN' | 'INSTRUCTOR'
  instructorProfileId: string
  displayName: string
}

/**
 * 以 auth user id 查出其 ACTIVE membership 對應的 workspace。查無則回傳 null。
 *
 * 匯出以便整合測試可直接驗證資料隔離，毋須模擬 auth 層。
 */
export async function loadWorkspaceContext(
  authUserId: string,
): Promise<WorkspaceContext | null> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      timezone: workspaces.timezone,
      isPublic: workspaces.isPublic,
      isExperience: workspaces.isExperience,
      experienceStartedAt: workspaces.experienceStartedAt,
      slotIntervalMinutes: workspaces.slotIntervalMinutes,
      minNoticeMinutes: workspaces.minNoticeMinutes,
      bookingHorizonDays: workspaces.bookingHorizonDays,
      role: workspaceMembers.role,
      instructorProfileId: instructorProfiles.id,
      displayName: instructorProfiles.displayName,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(instructorProfiles, eq(instructorProfiles.workspaceId, workspaces.id))
    .where(
      and(
        eq(users.authUserId, authUserId),
        eq(workspaceMembers.status, 'ACTIVE'),
        eq(instructorProfiles.isActive, true),
      ),
    )
    .limit(1)

  if (!row) return null

  return {
    ...row,
    authUserId,
    testWhatsAppOverride: row.isExperience ? getTestWhatsAppOverride() : null,
  }
}

/**
 * 是否曾完成業務資料 bootstrap。
 *
 * bootstrap 在單一 transaction 內建立 user、membership、workspace 與 profile；
 * 因此「有 user 但沒有可用 context」代表存取已停用或資料需要人工處理，不能
 * 當作新帳號再次建立 workspace。
 */
export async function hasBootstrappedBusinessUser(authUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1)

  return Boolean(row)
}

/**
 * 後台所有讀寫的授權起點。
 *
 * 一律由登入身分反查 workspace，**絕不接受 client 傳入的 workspace_id**
 * 作為授權依據（規格 §11.4、§13.1）。
 *
 * 首次進入後台時若尚無 workspace，在此執行 bootstrap。把 bootstrap 放在這裡
 * 而非註冊當下，是因為註冊流程可能因 email 驗證等步驟中斷；此處為冪等操作，
 * 每次進入都會收斂到同一個 workspace。
 *
 * 以 React `cache` 記憶化，同一次 render 內只查一次。
 */
export const requireWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const authUser = await requireAuthUser()

  const existing = await loadWorkspaceContext(authUser.authUserId)
  if (existing) {
    if (existing.isExperience && !existing.experienceStartedAt) {
      await initializeExperienceWorkspace({
        workspaceId: existing.workspaceId,
        instructorId: existing.instructorProfileId,
        userId: existing.userId,
      })
      const initialized = await loadWorkspaceContext(authUser.authUserId)
      if (!initialized) throw new Error('體驗資料初始化後找不到 workspace')
      return initialized
    }
    return existing
  }

  // 已存在的業務使用者若找不到 ACTIVE membership/profile，代表存取已被停用。
  // 不可重新 bootstrap，否則停權者會取得一個新的 workspace。
  if (await hasBootstrappedBusinessUser(authUser.authUserId)) {
    redirect('/access-disabled')
  }

  // 公開註冊關閉期間，只有由管理員寫入 app_metadata 的受邀測試帳號可初始化。
  // 使用者不能自行修改 app_metadata，因此直接呼叫 Supabase signUp 也無法繞過。
  if (isInviteTestingMode() && authUser.bookingAccess !== 'tester') {
    redirect('/access-disabled?reason=invite-only')
  }

  await bootstrapPersonalWorkspace({
    authUserId: authUser.authUserId,
    email: authUser.email,
  })

  const created = await loadWorkspaceContext(authUser.authUserId)
  if (!created) {
    throw new Error('Workspace bootstrap 後仍找不到對應的 workspace')
  }

  return created
})
