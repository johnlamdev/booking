'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { formatInZone } from '@/lib/time'
import { syncGoogleCalendarBookingSafely } from '@/server/calendar/google'
import { hashStatusToken } from '@/lib/token'
import { db } from '@/server/db'
import { bookingInquiries, instructorProfiles, rescheduleProposals, services, workspaces } from '@/server/db/schema'
import { requireWorkspaceContext } from '@/server/workspace/context'
import { getInquiryByStatusToken } from './queries'

import { acceptReschedule, declineReschedule, proposeReschedule } from './reschedule'

export type RescheduleActionState = { error?: string; success?: string; whatsAppUrl?: string } | null

export async function withdrawTeacherRescheduleAction(
  _state: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const ctx = await requireWorkspaceContext()
  const bookingId = String(formData.get('bookingId') ?? '')
  if (!z.string().uuid().safeParse(bookingId).success) return { error: '找不到這堂課。' }
  const [proposal] = await db.select({ id: rescheduleProposals.id })
    .from(rescheduleProposals)
    .innerJoin(bookingInquiries, eq(bookingInquiries.id, rescheduleProposals.bookingInquiryId))
    .where(and(
      eq(bookingInquiries.id, bookingId),
      eq(bookingInquiries.workspaceId, ctx.workspaceId),
      eq(rescheduleProposals.status, 'PENDING'),
      eq(rescheduleProposals.initiatedBy, 'INSTRUCTOR'),
    )).limit(1)
  if (!proposal) return { error: '找不到可撤回的改期提案。' }
  const result = await declineReschedule(proposal.id)
  if (!result.ok) return { error: result.error }
  revalidatePath('/dashboard/inquiries')
  revalidatePath(`/dashboard/inquiries/${bookingId}/reschedule`)
  return { success: '已撤回改期提案，原課堂時間維持不變。現在可以重新提出。' }
}

export async function withdrawStudentRescheduleAction(
  _state: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const token = String(formData.get('token') ?? '')
  const inquiry = await getInquiryByStatusToken(token)
  if (!inquiry || inquiry.status !== 'CONFIRMED') return { error: '這筆預約已無法撤回改期。' }
  const [proposal] = await db.select({ id: rescheduleProposals.id })
    .from(rescheduleProposals)
    .where(and(
      eq(rescheduleProposals.bookingInquiryId, inquiry.bookingId),
      eq(rescheduleProposals.status, 'PENDING'),
      eq(rescheduleProposals.initiatedBy, 'STUDENT'),
    )).limit(1)
  if (!proposal) return { error: '找不到可撤回的改期提案。' }
  const result = await declineReschedule(proposal.id)
  if (!result.ok) return { error: result.error }
  revalidatePath(`/inquiry/status/${token}/reschedule`)
  revalidatePath(`/inquiry/status/${token}`)
  revalidatePath('/dashboard/inquiries')
  return { success: '已撤回改期提案，原課堂時間維持不變。現在可以重新提出。' }
}

export async function proposeTeacherRescheduleAction(
  _state: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const ctx = await requireWorkspaceContext()
  const bookingId = String(formData.get('bookingId') ?? '')
  if (!z.string().uuid().safeParse(bookingId).success) return { error: '找不到這筆預約。' }
  const startAt = new Date(String(formData.get('startAt') ?? ''))
  const [booking] = await db.select({ studentPhone: bookingInquiries.studentPhone })
    .from(bookingInquiries).where(and(
      eq(bookingInquiries.id, bookingId), eq(bookingInquiries.workspaceId, ctx.workspaceId),
    )).limit(1)
  if (!booking) return { error: '找不到這筆預約。' }

  const result = await proposeReschedule({
    workspaceId: ctx.workspaceId, bookingId, proposedStartAt: startAt, initiatedBy: 'INSTRUCTOR',
  })
  if (!result.ok) return { error: result.error }

  revalidatePath('/dashboard/inquiries')
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reschedule/${result.token}`
  const message = `你好，我想把課堂改至另一個時間。請開啟連結查看新時間並決定是否接受：${url}`
  const phone = ctx.isExperience ? ctx.testWhatsAppOverride : booking.studentPhone
  return {
    success: '已建立改期提案。請用 WhatsApp 把連結傳給學生；在對方接受前，原時段仍然保留。',
    whatsAppUrl: buildWhatsAppUrl(phone ?? '', message) ?? undefined,
  }
}

export async function proposeStudentRescheduleAction(
  _state: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const token = String(formData.get('token') ?? '')
  const startAt = new Date(String(formData.get('startAt') ?? ''))
  const inquiry = await getInquiryByStatusToken(token)
  if (!inquiry || inquiry.status !== 'CONFIRMED') return { error: '這筆預約已無法改期。' }

  const [booking] = await db.select({ workspaceId: bookingInquiries.workspaceId })
    .from(bookingInquiries).where(eq(bookingInquiries.id, inquiry.bookingId)).limit(1)
  if (!booking) return { error: '找不到這筆預約。' }

  const result = await proposeReschedule({
    workspaceId: booking.workspaceId,
    bookingId: inquiry.bookingId,
    proposedStartAt: startAt,
    initiatedBy: 'STUDENT',
  })
  if (!result.ok) return { error: result.error }

  revalidatePath(`/inquiry/status/${token}`)
  const message = `你好，我想把「${inquiry.serviceName}」改到另一個時間。請登入約課易查看並回覆我的改期提案。`
  return {
    success: '已提出改期。老師接受之前，原本課堂時間仍然保留。',
    whatsAppUrl: buildWhatsAppUrl(inquiry.instructorWhatsApp ?? '', message) ?? undefined,
  }
}

export async function respondToStudentRescheduleAction(
  _state: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const ctx = await requireWorkspaceContext()
  const proposalId = String(formData.get('proposalId') ?? '')
  const decision = String(formData.get('decision') ?? '')
  if (!z.string().uuid().safeParse(proposalId).success) return { error: '找不到這項改期。' }
  const [proposal] = await db.select({ id: rescheduleProposals.id, initiatedBy: rescheduleProposals.initiatedBy, bookingId: rescheduleProposals.bookingInquiryId })
    .from(rescheduleProposals)
    .innerJoin(bookingInquiries, eq(bookingInquiries.id, rescheduleProposals.bookingInquiryId))
    .where(and(eq(rescheduleProposals.id, proposalId), eq(bookingInquiries.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!proposal || proposal.initiatedBy !== 'STUDENT') return { error: '找不到這項改期。' }

  const result = decision === 'accept'
    ? await acceptReschedule({ proposalId, actorType: 'USER', actorUserId: ctx.userId })
    : decision === 'decline' ? await declineReschedule(proposalId) : { ok: false as const, error: '請選擇接受或維持原時間。' }
  if (!result.ok) return { error: result.error }
  if (decision === 'accept') await syncGoogleCalendarBookingSafely(proposal.bookingId)
  revalidatePath('/dashboard/inquiries')
  revalidatePath('/dashboard/availability')
  const [booking] = await db.select({
    studentName: bookingInquiries.studentName,
    studentPhone: bookingInquiries.studentPhone,
    startAt: bookingInquiries.startAt,
    serviceName: services.name,
  }).from(bookingInquiries).innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .where(eq(bookingInquiries.id, proposal.bookingId)).limit(1)
  const phone = ctx.isExperience ? ctx.testWhatsAppOverride : booking?.studentPhone
  const message = booking ? `${booking.studentName} 你好，${decision === 'accept' ? '改期已確認' : '這次改期未能接受，原時間維持不變'}：${booking.serviceName}，${formatInZone(booking.startAt, ctx.timezone, 'yyyy年M月d日 HH:mm')}。` : ''
  return {
    success: decision === 'accept' ? '已接受改期。請透過 WhatsApp 通知學生。' : '已拒絕改期，原時間維持不變。請通知學生。',
    whatsAppUrl: buildWhatsAppUrl(phone ?? '', message) ?? undefined,
  }
}

export async function respondToTeacherRescheduleAction(
  _state: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const token = String(formData.get('token') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const [proposal] = await db.select({
    id: rescheduleProposals.id,
    initiatedBy: rescheduleProposals.initiatedBy,
    bookingId: rescheduleProposals.bookingInquiryId,
    teacherPhone: instructorProfiles.contactPhone,
    timezone: workspaces.timezone,
  }).from(rescheduleProposals)
    .innerJoin(bookingInquiries, eq(bookingInquiries.id, rescheduleProposals.bookingInquiryId))
    .innerJoin(instructorProfiles, eq(instructorProfiles.id, bookingInquiries.instructorId))
    .innerJoin(workspaces, eq(workspaces.id, bookingInquiries.workspaceId))
    .where(eq(rescheduleProposals.responseTokenHash, hashStatusToken(token))).limit(1)
  if (!proposal || proposal.initiatedBy !== 'INSTRUCTOR') return { error: '找不到這項改期。' }

  const result = decision === 'accept'
    ? await acceptReschedule({ proposalId: proposal.id, actorType: 'STUDENT' })
    : decision === 'decline' ? await declineReschedule(proposal.id) : { ok: false as const, error: '請選擇接受或維持原時間。' }
  if (!result.ok) return { error: result.error }
  if (decision === 'accept') await syncGoogleCalendarBookingSafely(proposal.bookingId)
  revalidatePath(`/reschedule/${token}`)
  revalidatePath('/dashboard/inquiries')
  revalidatePath('/dashboard/availability')
  const [booking] = await db.select({ startAt: bookingInquiries.startAt, serviceName: services.name })
    .from(bookingInquiries).innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .where(eq(bookingInquiries.id, proposal.bookingId)).limit(1)
  const message = booking ? `你好，我${decision === 'accept' ? '已接受改期' : '希望維持原時間'}：${booking.serviceName}，${formatInZone(booking.startAt, proposal.timezone, 'yyyy年M月d日 HH:mm')}。請在約課易查看最新狀態。` : ''
  return {
    success: decision === 'accept' ? '已接受改期，新時間已生效。請用 WhatsApp 告知老師。' : '已維持原本時間。請透過 WhatsApp 告知老師。',
    whatsAppUrl: buildWhatsAppUrl(proposal.teacherPhone ?? '', message) ?? undefined,
  }
}
