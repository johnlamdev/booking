import { notFound } from 'next/navigation'

import { formatInZone } from '@/lib/time'
import { StudentRescheduleResponse } from '@/components/student-reschedule-response'
import { getRescheduleByToken } from '@/server/inquiries/reschedule'

export default async function RescheduleResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const proposal = await getRescheduleByToken(token)
  if (!proposal || proposal.initiatedBy !== 'INSTRUCTOR') notFound()

  const original = formatInZone(proposal.originalStartAt, proposal.timezone, 'yyyy年M月d日 EEEE HH:mm')
  const next = formatInZone(proposal.proposedStartAt, proposal.timezone, 'yyyy年M月d日 EEEE HH:mm')

  return <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
    <h1 className="text-2xl font-semibold text-ink">老師提出改期</h1>
    <div className="mt-5 rounded-2xl border border-line bg-surface p-5 text-sm text-ink">
      <p>課堂：{proposal.serviceName}</p>
      <p className="mt-2">原時間：{original}</p>
      <p className="mt-2 font-semibold text-brand">建議新時間：{next}</p>
    </div>
    {proposal.status === 'PENDING' && proposal.bookingStatus === 'CONFIRMED' ? <>
      <p className="mt-4 text-sm text-ink-muted">你接受之前，原本的課堂時間繼續保留。接受後，新時間才正式成立；如果新時段已被約走，系統會請老師再提出其他時間。</p>
      <StudentRescheduleResponse token={token} />
    </> : <p className="mt-5 rounded-xl bg-brand-soft p-4 text-sm text-brand-strong">{proposal.status === 'ACCEPTED' ? '已接受改期，新時間已生效。' : proposal.status === 'DECLINED' ? '已拒絕改期，維持原時間。' : '這筆預約已變更，請聯絡老師。'}</p>}
  </main>
}
