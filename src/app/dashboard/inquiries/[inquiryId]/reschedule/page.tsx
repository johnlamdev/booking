import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'

import { TeacherRescheduleForm } from '@/components/teacher-reschedule-form'
import { WithdrawReschedule } from '@/components/withdraw-reschedule'
import { formatInZone } from '@/lib/time'
import { db } from '@/server/db'
import { bookingInquiries, services } from '@/server/db/schema'
import { getAvailableSlots, getWorkspacePreviewProfile } from '@/server/public/queries'
import { getPendingRescheduleForBooking } from '@/server/inquiries/reschedule'
import { requireWorkspaceContext } from '@/server/workspace/context'

export default async function TeacherReschedulePage({ params }: { params: Promise<{ inquiryId: string }> }) {
  const ctx = await requireWorkspaceContext()
  const { inquiryId } = await params
  const [booking] = await db.select({
    id: bookingInquiries.id,
    status: bookingInquiries.status,
    startAt: bookingInquiries.startAt,
    endAt: bookingInquiries.endAt,
    studentName: bookingInquiries.studentName,
    serviceName: services.name,
  }).from(bookingInquiries).innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .where(and(eq(bookingInquiries.id, inquiryId), eq(bookingInquiries.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!booking) notFound()

  const pending = await getPendingRescheduleForBooking(booking.id)
  const profile = await getWorkspacePreviewProfile(ctx.workspaceId)
  const durationMinutes = (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000
  const available = profile && booking.status === 'CONFIRMED' && !pending
    ? await getAvailableSlots({ profile, durationMinutes, days: Math.min(profile.bookingHorizonDays, 14), excludeBookingId: booking.id })
    : []
  const slots = available.filter((slot) => slot.startAt.getTime() !== booking.startAt.getTime()).map((slot) => ({
    value: slot.startAt.toISOString(),
    label: formatInZone(slot.startAt, ctx.timezone, 'yyyy年M月d日 EEEE HH:mm'),
  }))

  return <div className="mx-auto max-w-xl space-y-5">
    <Link href={`/dashboard/inquiries?inquiry=${booking.id}`} className="text-sm text-brand">← 返回課堂</Link>
    <h1 className="text-2xl font-semibold text-ink">提出改期</h1>
    <p className="text-sm text-ink-muted">{booking.studentName} · {booking.serviceName} · 原時間 {formatInZone(booking.startAt, ctx.timezone, 'yyyy年M月d日 EEEE HH:mm')}</p>
    {booking.status !== 'CONFIRMED' ? <p className="text-sm text-danger">只有已確認的課堂可改期。</p>
      : pending ? <div><p className="text-sm text-ink">這堂課已有待回覆的改期提案。{pending.initiatedBy === 'INSTRUCTOR' ? '如尚未傳出連結或想換時間，可以撤回再提出。' : '學生已提出改期，請返回課堂處理。'}</p>{pending.initiatedBy === 'INSTRUCTOR' ? <WithdrawReschedule role="teacher" bookingId={booking.id} /> : <Link href={`/dashboard/inquiries?inquiry=${booking.id}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand underline">返回課堂處理提案 →</Link>}</div>
      : <TeacherRescheduleForm bookingId={booking.id} slots={slots} />}
  </div>
}
