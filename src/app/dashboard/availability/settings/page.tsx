import Link from 'next/link'
import type { Metadata } from 'next'

import { ExceptionForm } from '@/components/exception-form'
import { SchedulingSettingsForm } from '@/components/scheduling-settings-form'
import { Button, Card } from '@/components/ui'
import { WeeklyScheduleForm } from '@/components/weekly-schedule-form'
import { deleteExceptionAction } from '@/server/availability/actions'
import { listUpcomingExceptions, listWeeklyRules } from '@/server/availability/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '常規時間設定' }

function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default async function AvailabilitySettingsPage() {
  const ctx = await requireWorkspaceContext()
  const today = todayInZone(ctx.timezone)
  const [rules, exceptions] = await Promise.all([
    listWeeklyRules(ctx.instructorProfileId),
    listUpcomingExceptions(ctx.instructorProfileId, today),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/availability" className="text-sm font-semibold text-brand">‹ 返回日曆</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">常規時間設定</h1>
        <p className="mt-1 text-sm text-ink-muted">設定學生平日可以選擇的整點時段；臨時課堂和休假可直接在日曆新增。</p>
      </div>

      <section aria-labelledby="weekly-heading">
        <h2 id="weekly-heading" className="mb-3 scroll-mt-24 text-sm font-semibold text-ink">每週常規時間</h2>
        <Card><WeeklyScheduleForm rules={rules} /></Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="exceptions-heading">
        <h2 id="exceptions-heading" className="scroll-mt-24 text-sm font-semibold text-ink">休息及特別日期</h2>
        {exceptions.length > 0 && (
          <Card>
            <ul className="flex flex-col gap-2">
              {exceptions.map((exception) => (
                <li key={exception.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                  <div><span className="text-sm text-ink">{exception.date}</span><span className="ml-2 text-xs text-ink-muted">{exception.isClosed ? '整天不開放' : `${exception.startTime}–${exception.endTime}`}</span>{exception.note && <span className="ml-2 text-xs text-ink-subtle">（{exception.note}）</span>}</div>
                  <form action={deleteExceptionAction}><input type="hidden" name="exceptionId" value={exception.id} /><Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">移除</Button></form>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <details className="group rounded-2xl border border-line bg-surface shadow-sm">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-brand marker:hidden">＋ 新增休息或特別時間</summary>
          <div className="border-t border-line p-5"><ExceptionForm today={today} /></div>
        </details>
      </section>

      <details className="group rounded-2xl border border-line bg-surface shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink marker:hidden">其他預約規則 <span className="float-right text-brand">›</span></summary>
        <div className="border-t border-line p-5"><SchedulingSettingsForm initial={{ slotIntervalMinutes: 60, minNoticeMinutes: ctx.minNoticeMinutes, bookingHorizonDays: ctx.bookingHorizonDays }} /></div>
      </details>
    </div>
  )
}
