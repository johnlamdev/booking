'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'

import { db } from '@/server/db'
import { workspaces } from '@/server/db/schema'
import { getPublishReadiness } from '@/server/public/queries'

import { requireWorkspaceContext } from './context'

export type PublishState = { error?: string } | null

/**
 * 發佈或取消發佈公開頁。
 *
 * 發佈條件（規格 §8.2）在 server 重新檢查，不能只靠介面把按鈕變灰：
 * 至少一項啟用中的服務，以及至少一條開放時間規則。
 *
 * 取消發佈不影響任何既有預約，只是新查詢無法再提交。
 */
export async function setPublishStateAction(formData: FormData): Promise<PublishState> {
  const ctx = await requireWorkspaceContext()
  const nextIsPublic = String(formData.get('isPublic') ?? '') === 'true'

  if (nextIsPublic) {
    const readiness = await getPublishReadiness(ctx.workspaceId, ctx.instructorProfileId)

    if (!readiness.hasService) {
      return { error: '需要至少一項啟用中的服務才能發佈。' }
    }
    if (!readiness.hasSchedule) {
      return { error: '需要先設定每週開放時間才能發佈。' }
    }
    if (!readiness.hasWhatsApp) {
      return { error: '請先在公開資料填寫有效的 WhatsApp 號碼，讓學生提交查詢後通知你。' }
    }
  }

  await db
    .update(workspaces)
    .set({ isPublic: nextIsPublic })
    .where(eq(workspaces.id, ctx.workspaceId))

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings/share')
  revalidatePath(`/book/${ctx.workspaceSlug}`)

  return null
}
