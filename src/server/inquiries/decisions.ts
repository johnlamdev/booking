'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'

import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { syncGoogleCalendarBookingSafely } from '@/server/calendar/google'
import { db } from '@/server/db'
import { bookingInquiries } from '@/server/db/schema'
import { requireWorkspaceContext, type WorkspaceContext } from '@/server/workspace/context'

import { cancelConfirmedInquiry, confirmInquiry, rejectInquiry } from './confirm'

export type DecisionState = {
  error?: string
  success?: string
  outcome?: 'CONFIRMED' | 'REJECTED' | 'CANCELLED'
  conflictCount?: number
} | null

function revalidate() {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/inquiries')
}

async function getWhatsAppRedirectUrl(
  ctx: WorkspaceContext,
  inquiryId: string,
  message: string,
): Promise<string | null> {
  if (!message) return null

  let phone = ctx.testWhatsAppOverride
  if (!ctx.isExperience) {
    const [inquiry] = await db
      .select({ studentPhone: bookingInquiries.studentPhone })
      .from(bookingInquiries)
      .where(and(eq(bookingInquiries.id, inquiryId), eq(bookingInquiries.workspaceId, ctx.workspaceId)))
      .limit(1)
    phone = inquiry?.studentPhone ?? null
  }

  return buildWhatsAppUrl(phone ?? '', message)
}

/**
 * 確認一筆查詢。
 *
 * 這一層只負責授權與訊息呈現；交易與併發保證在 confirmInquiry()，
 * 分開是為了讓整合測試能直接驗證併發行為（見 confirm.integration.test.ts）。
 */
export async function confirmInquiryAction(
  _prevState: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const ctx = await requireWorkspaceContext()

  const inquiryId = String(formData.get('inquiryId') ?? '')
  if (!inquiryId) return { error: '找不到指定的查詢' }

  let result
  try {
    result = await confirmInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId,
    })
  } catch (error) {
    console.error('[inquiries] confirm failed', error)
    return { error: '暫時未能確認這筆查詢，請重新整理後再試。' }
  }

  if (!result.ok) return { error: result.error }

  revalidate()
  await syncGoogleCalendarBookingSafely(inquiryId)

  const whatsappMessage = String(formData.get('whatsappMessage') ?? '').trim().slice(0, 1000)
  const whatsappUrl = await getWhatsAppRedirectUrl(ctx, inquiryId, whatsappMessage)
  if (whatsappUrl) redirect(whatsappUrl)

  return {
    success:
      result.conflictCount > 0
        ? `已確認。同一時段另外 ${result.conflictCount} 筆查詢已標記為「時段已被預約」，仍需自行通知學生。`
        : '已確認。',
    outcome: 'CONFIRMED',
    conflictCount: result.conflictCount,
  }
}

export async function rejectInquiryAction(
  _prevState: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const ctx = await requireWorkspaceContext()

  const inquiryId = String(formData.get('inquiryId') ?? '')
  if (!inquiryId) return { error: '找不到指定的查詢' }

  const reason = String(formData.get('rejectionReason') ?? '').trim().slice(0, 200) || null

  let result
  try {
    result = await rejectInquiry({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      inquiryId,
      reason,
    })
  } catch (error) {
    console.error('[inquiries] reject failed', error)
    return { error: '暫時未能拒絕這筆查詢，請重新整理後再試。' }
  }

  if (!result.ok) return { error: result.error }

  revalidate()
  const whatsappMessage = String(formData.get('whatsappMessage') ?? '').trim().slice(0, 1000)
  const whatsappUrl = await getWhatsAppRedirectUrl(ctx, inquiryId, whatsappMessage)
  if (whatsappUrl) redirect(whatsappUrl)
  return { success: '已拒絕這次查詢。請自行通知學生。', outcome: 'REJECTED' }
}

export async function cancelInquiryAction(formData: FormData): Promise<DecisionState> {
  const ctx = await requireWorkspaceContext()

  const inquiryId = String(formData.get('inquiryId') ?? '')
  if (!inquiryId) return { error: '找不到指定的預約' }

  const reason = String(formData.get('cancellationReason') ?? '').trim().slice(0, 200) || null
  const result = await cancelConfirmedInquiry({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    inquiryId,
    reason,
  })

  if (!result.ok) return { error: result.error }

  revalidate()
  await syncGoogleCalendarBookingSafely(inquiryId)
  return { success: '預約已取消，原本的時間已重新開放。請自行通知學生。', outcome: 'CANCELLED' }
}
