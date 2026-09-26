import Link from 'next/link'
import type { Metadata } from 'next'
import { z } from 'zod'

import { InquiryDecision } from '@/components/inquiry-decision'
import { InquiryCancellation } from '@/components/inquiry-cancellation'
import { WhatsAppComposer } from '@/components/whatsapp-composer'
import { Alert, Card } from '@/components/ui'
import { formatDateInZone, formatInZone, formatTimeRangeInZone } from '@/lib/time'
import { normalizeStudentPhone } from '@/lib/student-identity'
import { listUpcomingExceptions } from '@/server/availability/queries'
import { getInquiryConflictSummaries, type InquiryConflictSummary } from '@/server/public/queries'
import { listInquiries, type InquiryStatus } from '@/server/inquiries/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '預約查詢' }

const FILTERS: { value: InquiryStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: '待處理' },
  { value: 'CONFIRMED', label: '已確認' },
  { value: 'REJECTED_CONFLICT', label: '時段衝突' },
  { value: 'REJECTED', label: '已拒絕' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'ALL', label: '全部' },
]

const STATUS_LABELS: Record<InquiryStatus, string> = {
  PENDING: '待處理',
  CONFIRMED: '已確認',
  REJECTED: '已拒絕',
  REJECTED_CONFLICT: '時段已被預約',
  EXPIRED: '已過期',
  CANCELLED: '已取消',
}

const NO_CONFLICT: InquiryConflictSummary = {
  sameTimePendingCount: 0,
  overlappingPendingCount: 0,
  hasConfirmedConflict: false,
}

export default async function InquiriesPage({ searchParams }: PageProps<'/dashboard/inquiries'>) {
  const ctx = await requireWorkspaceContext()
  const query = await searchParams

  const requested = typeof query.status === 'string' ? query.status : 'PENDING'
  const status = (FILTERS.some((f) => f.value === requested) ? requested : 'PENDING') as
    | InquiryStatus
    | 'ALL'
  const inquiryParam = typeof query.inquiry === 'string' ? query.inquiry : null
  const parsedInquiryId = z.string().uuid().safeParse(inquiryParam)
  const isFocused = inquiryParam !== null
  const focusedInquiryId = parsedInquiryId.success ? parsedInquiryId.data : undefined

  const today = formatInZone(new Date(), ctx.timezone, 'yyyy-MM-dd')
  const [inquiries, upcomingExceptions] = await Promise.all([
    isFocused && !focusedInquiryId
      ? Promise.resolve([])
      : listInquiries({
          workspaceId: ctx.workspaceId,
          status,
          inquiryId: focusedInquiryId,
        }),
    listUpcomingExceptions(ctx.instructorProfileId, today),
  ])
  const closedDates = new Set(
    upcomingExceptions
      .filter((exception) => exception.isClosed)
      .map((exception) => exception.date),
  )

  // 確認前要讓老師知道同一時段還有多少人在等（規格 §8.9）
  const conflictSummaries = await getInquiryConflictSummaries({
    instructorId: ctx.instructorProfileId,
    inquiries,
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-medium text-brand">收件匣</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
          {isFocused ? '查詢詳情' : '預約查詢'}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          時間以{ctx.timezone === 'Asia/Hong_Kong' ? '香港時間' : '老師所在地時間'}顯示。確認後該時段才會被佔用。
        </p>
      </div>

      {isFocused && (
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/dashboard/availability" className="text-brand">← 返回日曆</Link>
          <Link href="/dashboard/inquiries" className="text-ink-muted">查看全部查詢</Link>
        </div>
      )}

      {!isFocused && <nav aria-label="狀態篩選">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const isActive = filter.value === status
            return (
              <li key={filter.value}>
                <Link
                  href={`/dashboard/inquiries?status=${filter.value}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-block rounded-full border px-3 py-1 text-sm ${
                    isActive
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  {filter.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>}

      {inquiries.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm font-semibold text-ink">
            {isFocused
              ? '找不到這筆查詢，或你沒有權限查看。'
              : status === 'PENDING'
                ? '目前沒有待處理的查詢。'
                : '這個篩選沒有任何查詢。'}
          </p>
          {isFocused ? (
            <Link
              href="/dashboard/availability"
              className="mt-4 inline-flex rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink"
            >
              返回日曆
            </Link>
          ) : status === 'PENDING' && (
            <>
              <p className="mt-1 text-xs text-ink-muted">分享預約頁後，學生提交的查詢會顯示在這裡。</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href="/dashboard/settings/share" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">分享預約頁</Link>
                <Link href={`/book/${ctx.workspaceSlug}`} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink">預覽學生頁</Link>
              </div>
            </>
          )}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {inquiries.map((inquiry) => {
            const conflict = conflictSummaries[inquiry.id] ?? NO_CONFLICT
            const dateLabel = formatDateInZone(inquiry.startAt, ctx.timezone)
            const inquiryDate = formatInZone(inquiry.startAt, ctx.timezone, 'yyyy-MM-dd')
            const isClosedDay = closedDates.has(inquiryDate)
            const deliveryPhone = ctx.isExperience ? ctx.testWhatsAppOverride : inquiry.studentPhone
            const timeLabel = formatTimeRangeInZone(inquiry.startAt, inquiry.endAt, ctx.timezone)
            const fullTimeLabel = `${dateLabel} ${timeLabel}`

            /*
             * 狀態連結的 token 只以 hash 儲存，我們無法還原明文，
             * 因此訊息裡不放連結——學生提交時已經拿過自己的連結。
             */
            const timezoneLabel = ctx.timezone === 'Asia/Hong_Kong' ? '香港時間' : ctx.timezone
            const confirmationMessage = [
              `${inquiry.studentName} 你好，`,
              `你的預約已確認：`,
              `${inquiry.serviceName}`,
              `${fullTimeLabel}（${timezoneLabel}）`,
              '',
              `如有問題請直接回覆此訊息。`,
            ].join('\n')
            const rejectionMessage = [
              `${inquiry.studentName} 你好，`,
              `老師未能接受以下預約查詢：`,
              `${inquiry.serviceName}`,
              `${fullTimeLabel}（${timezoneLabel}）`,
            ].join('\n')
            const cancellationMessage = [
              `${inquiry.studentName} 你好，`,
              `以下預約已取消：`,
              `${inquiry.serviceName}`,
              `${fullTimeLabel}（${timezoneLabel}）`,
              '',
              `抱歉造成不便，請回覆此訊息再安排其他時間。`,
            ].join('\n')
            const pendingMessage = [
              `${inquiry.studentName} 你好，`,
              `我是 ${ctx.displayName}。已收到你的約堂查詢：`,
              `${inquiry.serviceName}`,
              `${fullTimeLabel}（${timezoneLabel}）`,
              '',
              `我會盡快確認並透過 WhatsApp 回覆你。`,
            ].join('\n')
            const resolvedNotification = inquiry.status === 'CONFIRMED'
              ? confirmationMessage
              : inquiry.status === 'REJECTED'
                ? [rejectionMessage, inquiry.rejectionReason ? `原因：${inquiry.rejectionReason}` : ''].filter(Boolean).join('\n')
                : inquiry.status === 'CANCELLED'
                  ? [cancellationMessage, inquiry.cancellationReason ? `原因：${inquiry.cancellationReason}` : ''].filter(Boolean).join('\n')
                  : inquiry.status === 'REJECTED_CONFLICT'
                    ? `${inquiry.studentName} 你好，\n你查詢的 ${fullTimeLabel} 已由其他學生確認，請選擇其他時間。`
                    : inquiry.status === 'EXPIRED'
                      ? `${inquiry.studentName} 你好，\n你查詢的 ${fullTimeLabel} 已過期，請重新選擇時間。`
                      : null

            return (
              <li key={inquiry.id}>
                <Card>
                  {inquiry.status === 'PENDING' && conflict.hasConfirmedConflict && (
                    <Alert tone="error" className="mb-4 font-medium">
                      ⚠ 此時段已與一節已確認課堂重疊，不能再次確認。請拒絕這筆查詢，或先取消原有課堂。
                    </Alert>
                  )}

                  {inquiry.status === 'PENDING' && !conflict.hasConfirmedConflict && conflict.sameTimePendingCount > 0 && (
                    <Alert tone="error" className="mb-4 font-medium">
                      ⚠ 同一時段另有 {conflict.sameTimePendingCount} 筆待確認查詢。你只可確認其中一筆；確認後，其餘查詢會自動標記為「時段已被預約」。
                    </Alert>
                  )}

                  {inquiry.status === 'PENDING' && !conflict.hasConfirmedConflict && conflict.sameTimePendingCount === 0 && conflict.overlappingPendingCount > 0 && (
                    <Alert tone="error" className="mb-4 font-medium">
                      ⚠ 此查詢與另外 {conflict.overlappingPendingCount} 筆待確認查詢時間重疊。確認其中一筆後，其他重疊查詢會自動標記為「時段已被預約」。
                    </Alert>
                  )}

                  {inquiry.status === 'REJECTED_CONFLICT' && (
                    <Alert tone="error" className="mb-4 font-medium">
                      此查詢已撞到一節已確認課堂，因此不能再確認。
                    </Alert>
                  )}

                  {inquiry.status === 'CONFIRMED' && isClosedDay && (
                    <Alert tone="error" className="mb-4 font-medium">
                      ⚠ 此日已設為不開放。這堂課是設定前保留的安排，請取消預約。
                    </Alert>
                  )}

                  {inquiry.status === 'PENDING' && isClosedDay && (
                    <Alert tone="error" className="mb-4 font-medium">
                      ⚠ 此日已設為不開放，不能確認這筆查詢。請拒絕或回覆學生另選時間。
                    </Alert>
                  )}

                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{fullTimeLabel}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {inquiry.serviceName}（{inquiry.durationMinutes} 分鐘）
                      </p>
                    </div>

                    <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-xs text-ink-muted">
                      {STATUS_LABELS[inquiry.status]}
                      {inquiry.isPast && inquiry.status === 'PENDING' && '（已過時間）'}
                    </span>
                  </div>

                  <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-muted">學生</dt>
                      <dd className="text-right text-ink">{inquiry.studentName}</dd>
                    </div>
                    {inquiry.studentPhone && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">WhatsApp</dt>
                        <dd className="text-right text-ink">
                          <a href={ctx.isExperience ? (deliveryPhone ? `https://wa.me/${deliveryPhone}` : undefined) : `https://wa.me/${normalizeStudentPhone(inquiry.studentPhone)}`} target="_blank" rel="noreferrer" aria-disabled={ctx.isExperience && !deliveryPhone} className={`font-medium ${deliveryPhone || !ctx.isExperience ? 'text-emerald-700 underline' : 'text-ink-subtle'}`}>
                            {inquiry.studentPhone}
                          </a>
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-muted">提交時間</dt>
                      <dd className="text-right text-xs text-ink-subtle">
                        {formatDateInZone(inquiry.submittedAt, ctx.timezone)}{' '}
                        {formatTimeRangeInZone(
                          inquiry.submittedAt,
                          inquiry.submittedAt,
                          ctx.timezone,
                        ).split('–')[0]}
                      </dd>
                    </div>
                  </dl>

                  {inquiry.studentNote && (
                    <div className="mt-3 rounded-lg bg-canvas p-3">
                      <p className="text-xs font-medium text-ink-muted">學生備註</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">
                        {inquiry.studentNote}
                      </p>
                    </div>
                  )}

                  {inquiry.rejectionReason && (
                    <p className="mt-3 text-sm text-ink-muted">
                      拒絕原因：{inquiry.rejectionReason}
                    </p>
                  )}

                  {inquiry.cancellationReason && (
                    <p className="mt-3 text-sm text-ink-muted">
                      取消原因：{inquiry.cancellationReason}
                    </p>
                  )}

                  {inquiry.status === 'PENDING' && !inquiry.isPast && (
                    <div className="mt-4 border-t border-line pt-3">
                      <InquiryDecision
                        inquiryId={inquiry.id}
                        hasConfirmedConflict={conflict.hasConfirmedConflict}
                        confirmationMessage={confirmationMessage}
                        rejectionMessage={rejectionMessage}
                        pendingMessage={pendingMessage}
                        studentPhone={deliveryPhone}
                        testMode={ctx.isExperience}
                        isClosedDay={isClosedDay}
                      />
                    </div>
                  )}

                  {inquiry.status === 'CONFIRMED' && !inquiry.isPast && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3">
                      {!isClosedDay && (
                        <WhatsAppComposer phone={deliveryPhone} message={confirmationMessage} label="WhatsApp 傳送確認" testMode={ctx.isExperience} />
                      )}
                      <InquiryCancellation
                        inquiryId={inquiry.id}
                        timeLabel={fullTimeLabel}
                        cancellationMessage={cancellationMessage}
                        studentPhone={deliveryPhone}
                        testMode={ctx.isExperience}
                      />
                    </div>
                  )}

                  {resolvedNotification && inquiry.status !== 'CONFIRMED' && (
                    <div className="mt-4 border-t border-line pt-3">
                      <WhatsAppComposer phone={deliveryPhone} message={resolvedNotification} label="WhatsApp 聯絡學生" testMode={ctx.isExperience} />
                    </div>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
