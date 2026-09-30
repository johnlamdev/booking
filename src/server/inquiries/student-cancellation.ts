'use server'

import { revalidatePath } from 'next/cache'

import { formatInZone } from '@/lib/time'
import { hashStatusToken } from '@/lib/token'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { syncGoogleCalendarBookingSafely } from '@/server/calendar/google'

import { cancelConfirmedInquiryByStudent } from './confirm'
import { getInquiryByStatusToken } from './queries'

export type StudentCancellationState = { error?: string; success?: string; whatsAppUrl?: string } | null

export async function cancelStudentBookingAction(
  _state: StudentCancellationState,
  formData: FormData,
): Promise<StudentCancellationState> {
  const token = String(formData.get('token') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 200) || null
  const inquiry = await getInquiryByStatusToken(token)
  if (!inquiry || inquiry.status !== 'CONFIRMED' || inquiry.startAt <= new Date()) {
    return { error: '這筆預約已無法取消，請直接聯絡老師。' }
  }

  const result = await cancelConfirmedInquiryByStudent({
    inquiryId: inquiry.bookingId,
    statusTokenHash: hashStatusToken(token),
    reason,
  })
  if (!result.ok) return { error: result.error }

  await syncGoogleCalendarBookingSafely(inquiry.bookingId)
  revalidatePath(`/inquiry/status/${token}`)
  revalidatePath('/dashboard/inquiries')
  revalidatePath('/dashboard/availability')
  const message = `你好，我已取消 ${inquiry.serviceName}（${formatInZone(inquiry.startAt, inquiry.timezone, 'yyyy年M月d日 HH:mm')}）的預約。請在約課易查看最新狀態。${reason ? `原因：${reason}` : ''}`
  return {
    success: '預約已取消，原本的時間已重新開放。請用 WhatsApp 告知老師。',
    whatsAppUrl: buildWhatsAppUrl(inquiry.instructorWhatsApp ?? '', message) ?? undefined,
  }
}
