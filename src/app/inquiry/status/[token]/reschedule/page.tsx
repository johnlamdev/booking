import Link from 'next/link'
import { notFound } from 'next/navigation'

import { StudentRescheduleForm } from '@/components/student-reschedule-form'
import { WithdrawReschedule } from '@/components/withdraw-reschedule'
import { formatInZone } from '@/lib/time'
import { getAvailableSlots, getPublishedProfile } from '@/server/public/queries'
import { getInquiryByStatusToken } from '@/server/inquiries/queries'
import { getPendingRescheduleForBooking } from '@/server/inquiries/reschedule'

export default async function StudentReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inquiry = await getInquiryByStatusToken(token)
  if (!inquiry) notFound()
  const pending = await getPendingRescheduleForBooking(inquiry.bookingId)
  const profile = await getPublishedProfile(inquiry.workspaceSlug)
  const durationMinutes = (inquiry.endAt.getTime() - inquiry.startAt.getTime()) / 60_000
  const available = inquiry.status === 'CONFIRMED' && profile && !pending
    ? await getAvailableSlots({ profile, durationMinutes, days: Math.min(profile.bookingHorizonDays, 14), excludeBookingId: inquiry.bookingId })
    : []
  const slots = available.filter((slot) => slot.startAt.getTime() !== inquiry.startAt.getTime()).map((slot) => ({
    value: slot.startAt.toISOString(),
    label: formatInZone(slot.startAt, inquiry.timezone, 'yyyy年M月d日 EEEE HH:mm'),
  }))

  return <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-8">
    <Link href={`/inquiry/status/${token}`} className="text-sm text-brand">← 返回預約狀態</Link>
    <h1 className="text-2xl font-semibold text-ink">提出改期</h1>
    <p className="text-sm text-ink-muted">{inquiry.serviceName} · 原時間 {formatInZone(inquiry.startAt, inquiry.timezone, 'yyyy年M月d日 EEEE HH:mm')}</p>
    {inquiry.status !== 'CONFIRMED' ? <p className="text-sm text-danger">只有已確認的課堂可改期。</p>
      : pending ? <div><p className="text-sm text-ink">這堂課已有待回覆的改期提案。{pending.initiatedBy === 'STUDENT' ? '如想選另一個時間，可以撤回再提出。' : '請查看老師傳來的改期連結。'}</p>{pending.initiatedBy === 'STUDENT' && <WithdrawReschedule role="student" token={token} />}</div>
      : !profile ? <p className="text-sm text-ink">老師目前沒有開放網上改期，請用 WhatsApp 聯絡老師。</p>
      : <StudentRescheduleForm token={token} slots={slots} />}
  </main>
}
