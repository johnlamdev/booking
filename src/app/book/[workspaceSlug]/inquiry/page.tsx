import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { InquiryForm } from '@/components/inquiry-form'
import { Card } from '@/components/ui'
import { generateIdempotencyKey } from '@/lib/token'
import { formatDateInZone, formatTimeRangeInZone } from '@/lib/time'
import { getAvailableSlots, getPublicServices, getPublishedProfile } from '@/server/public/queries'

export const metadata: Metadata = { title: '提交預約查詢' }

export default async function InquiryPage({
  params,
  searchParams,
}: PageProps<'/book/[workspaceSlug]/inquiry'>) {
  const { workspaceSlug } = await params
  const query = await searchParams

  const profile = await getPublishedProfile(workspaceSlug)
  if (!profile) notFound()

  const serviceId = typeof query.service === 'string' ? query.service : ''
  const startIso = typeof query.start === 'string' ? query.start : ''

  const services = await getPublicServices(profile.workspaceId)
  const service = services.find((s) => s.id === serviceId)

  const startAt = new Date(startIso)
  if (!service || Number.isNaN(startAt.getTime())) notFound()

  // 顯示表單前先確認該時間仍可預約，避免學生白填一輪
  const slots = await getAvailableSlots({ profile, durationMinutes: service.durationMinutes })
  const stillAvailable = slots.some((s) => s.startAt.getTime() === startAt.getTime())

  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000)

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <Link href={`/book/${profile.slug}?service=${service.id}`} className="text-sm font-medium text-brand">
        ← 返回選擇時間
      </Link>

      <p className="mt-5 text-sm font-medium text-brand">最後一步</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">提交預約查詢</h1>
      <p className="mt-1 text-sm text-ink-muted">留下 WhatsApp 號碼，老師會直接回覆及確認約堂。</p>

      <Card className="mt-4">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">老師</dt>
            <dd className="text-ink">{profile.displayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">課堂</dt>
            <dd className="text-right text-ink">{service.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">日期</dt>
            <dd className="text-ink">{formatDateInZone(startAt, profile.timezone)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">時間</dt>
            <dd className="text-ink">
              {formatTimeRangeInZone(startAt, endAt, profile.timezone)}
              <span className="ml-1 text-xs text-ink-subtle">（{profile.timezone === 'Asia/Hong_Kong' ? '香港時間' : '老師所在地時間'}）</span>
            </dd>
          </div>
        </dl>
      </Card>

      {!stillAvailable ? (
        <Card className="mt-4">
          <p className="text-sm text-danger">這個時間已經不能預約了。</p>
          <Link
            href={`/book/${profile.slug}?service=${service.id}`}
            className="mt-2 inline-block text-sm text-brand underline"
          >
            返回選擇其他時間
          </Link>
        </Card>
      ) : (
        <div className="mt-5">
          <InquiryForm
            slug={profile.slug}
            serviceId={service.id}
            startIso={startAt.toISOString()}
            // 每次載入表單產生一把新鑰匙；重複點擊送出的是同一把，只會建立一筆
            idempotencyKey={generateIdempotencyKey()}
          />
        </div>
      )}
    </main>
  )
}
