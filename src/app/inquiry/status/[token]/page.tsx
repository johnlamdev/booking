import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { StatusLinkActions } from '@/components/status-link-actions'
import { StudentBookingCancellation } from '@/components/student-booking-cancellation'
import { Card } from '@/components/ui'
import { formatDateInZone, formatTimeRangeInZone } from '@/lib/time'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { getInquiryByStatusToken, type InquiryStatus } from '@/server/inquiries/queries'

export const metadata: Metadata = { title: '查詢狀態' }

/** 文案必須一致，絕不可把待確認顯示成「預約完成」（規格 §12.4）。 */
const STATUS_COPY: Record<
  InquiryStatus,
  { label: string; detail: string; tone: 'pending' | 'good' | 'bad' }
> = {
  PENDING: {
    label: '等待老師確認',
    detail: '你的查詢已送出，老師確認後才算預約成功。請在下方開啟 WhatsApp 通知老師，並保存狀態連結。',
    tone: 'pending',
  },
  CONFIRMED: {
    label: '老師已確認你的預約',
    detail: '這個時段已為你保留。',
    tone: 'good',
  },
  REJECTED: {
    label: '老師未能接受這次查詢',
    detail: '你可以返回預約頁選擇其他時間。',
    tone: 'bad',
  },
  REJECTED_CONFLICT: {
    label: '此時段已由其他學生確認',
    detail: '這個時間已經被預約了，請返回預約頁選擇其他時間。',
    tone: 'bad',
  },
  EXPIRED: {
    label: '這次查詢已過期',
    detail: '老師未在課堂開始前處理這筆查詢。請重新提交或直接聯絡老師。',
    tone: 'bad',
  },
  CANCELLED: {
    label: '這次預約已取消',
    detail: '原本的時段已重新開放。如需上課，可以選擇其他時間。',
    tone: 'bad',
  },
}

const TONE_STYLES = {
  pending: 'border-notice/30 bg-notice-soft text-notice',
  good: 'border-brand/30 bg-brand/5 text-brand-strong',
  bad: 'border-line bg-canvas text-ink-muted',
} as const

export default async function InquiryStatusPage({
  params,
}: PageProps<'/inquiry/status/[token]'>) {
  const { token } = await params

  const inquiry = await getInquiryByStatusToken(token)
  // 無效或不存在的 token 一律一般化 404，不透露該查詢是否存在（規格 §8.8）
  if (!inquiry) notFound()

  const copy = STATUS_COPY[inquiry.status]
  const timezoneLabel = inquiry.timezone === 'Asia/Hong_Kong' ? '香港時間' : inquiry.timezone
  const shouldChooseAgain = ['REJECTED', 'REJECTED_CONFLICT', 'EXPIRED', 'CANCELLED'].includes(inquiry.status)
  const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/inquiry/status/${token}`
  const teacherMessage = `你好，我剛在約課易提交了 ${formatDateInZone(inquiry.startAt, inquiry.timezone)} ${formatTimeRangeInZone(inquiry.startAt, inquiry.endAt, inquiry.timezone)} 的「${inquiry.serviceName}」預約查詢。請查看並回覆我：${statusUrl}`
  const teacherWhatsAppUrl = inquiry.status === 'PENDING'
    ? buildWhatsAppUrl(inquiry.instructorWhatsApp ?? '', teacherMessage)
    : null

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <Link href={`/book/${inquiry.workspaceSlug}`} className="inline-flex min-h-10 items-center text-sm font-medium text-brand">
        ← 返回 {inquiry.instructorName} 的預約頁
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-ink">預約查詢狀態</h1>

      <div className={`mt-4 rounded-xl border p-4 ${TONE_STYLES[copy.tone]}`}>
        {/* 狀態同時以文字表達，不單靠顏色（規格 §13.4） */}
        <p className="text-base font-medium">{copy.label}</p>
        <p className="mt-1 text-sm">{copy.detail}</p>
      </div>

      <Card className="mt-4">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">老師</dt>
            <dd className="text-ink">{inquiry.instructorName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">課堂</dt>
            <dd className="text-right text-ink">{inquiry.serviceName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">日期</dt>
            <dd className="text-ink">{formatDateInZone(inquiry.startAt, inquiry.timezone)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">時間</dt>
            <dd className="text-ink">
              {formatTimeRangeInZone(inquiry.startAt, inquiry.endAt, inquiry.timezone)}
              <span className="ml-1 text-xs text-ink-subtle">（{timezoneLabel}）</span>
            </dd>
          </div>
          {inquiry.maskedContact && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">WhatsApp</dt>
              <dd className="break-all text-right font-mono text-xs text-ink">
                {inquiry.maskedContact}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {inquiry.status === 'CONFIRMED' && inquiry.startAt > new Date() && <Link href={`/inquiry/status/${token}/reschedule`} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-brand/30 px-4 text-sm font-semibold text-brand-strong">想改時間？查看老師空檔 →</Link>}
      {inquiry.status === 'CONFIRMED' && inquiry.startAt > new Date() && <StudentBookingCancellation token={token} />}

      {inquiry.status === 'REJECTED' && inquiry.rejectionReason && (
        <Card className="mt-4">
          <h2 className="text-sm font-medium text-ink">老師的說明</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">
            {inquiry.rejectionReason}
          </p>
        </Card>
      )}

      {inquiry.status === 'CANCELLED' && inquiry.cancellationReason && (
        <Card className="mt-4">
          <h2 className="text-sm font-medium text-ink">取消說明</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">
            {inquiry.cancellationReason}
          </p>
        </Card>
      )}

      {teacherWhatsAppUrl && (
        <Card className="mt-4 border-brand/30 bg-brand-soft">
          <h2 className="text-sm font-semibold text-ink">用 WhatsApp 通知老師</h2>
          <p className="mt-1 text-sm text-ink-muted">開啟 WhatsApp 後，請親自按「傳送」。傳送前這筆查詢只會出現在老師的約課易後台。</p>
          <a href={teacherWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white">開啟 WhatsApp，通知老師 →</a>
        </Card>
      )}

      <Card className="mt-4">
        <p className="text-sm font-medium text-ink">保存這個狀態頁</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          系統不會自動寄送此連結。請複製、分享或加入書籤，以便之後查看最新狀態。
        </p>
        <StatusLinkActions />
      </Card>

      <div className="mt-5">
        <Link
          href={`/book/${inquiry.workspaceSlug}`}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm"
        >
          {shouldChooseAgain ? '返回預約頁，選擇其他時間' : '返回老師預約頁'}
        </Link>
      </div>
    </main>
  )
}
