import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { PublicSlotPicker, type PublicSlotDay } from '@/components/public-slot-picker'
import { Card } from '@/components/ui'
import { groupSlotsByDate, WEEKDAY_LABELS } from '@/lib/availability'
import { formatInZone, formatTimeInZone } from '@/lib/time'
import { getAuthUser } from '@/server/auth/dal'
import {
  getAvailableSlots,
  getPublicServices,
  getPublishedProfile,
  getWorkspacePreviewProfile,
} from '@/server/public/queries'
import { loadWorkspaceContext } from '@/server/workspace/context'

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/book/[workspaceSlug]'>): Promise<Metadata> {
  const { workspaceSlug } = await params
  const query = await searchParams
  let profile = await getPublishedProfile(workspaceSlug)
  if (query.preview === '1') {
    const user = await getAuthUser()
    const ctx = user ? await loadWorkspaceContext(user.authUserId) : null
    profile = ctx?.workspaceSlug === workspaceSlug.toLowerCase()
      ? await getWorkspacePreviewProfile(ctx.workspaceId)
      : null
  }

  return { title: profile ? `${query.preview === '1' ? '預覽' : '預約'} ${profile.displayName}` : '找不到頁面', robots: query.preview === '1' ? { index: false, follow: false } : undefined }
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: PageProps<'/book/[workspaceSlug]'>) {
  const { workspaceSlug } = await params
  const query = await searchParams

  const preview = query.preview === '1'
  let profile = await getPublishedProfile(workspaceSlug)
  if (preview) {
    const user = await getAuthUser()
    const ctx = user ? await loadWorkspaceContext(user.authUserId) : null
    if (!ctx || ctx.workspaceSlug !== workspaceSlug.toLowerCase()) notFound()
    profile = await getWorkspacePreviewProfile(ctx.workspaceId)
  }
  // 未發佈或不存在一律顯示一般化 404，不透露該 slug 是否已被使用
  if (!profile) notFound()

  const services = await getPublicServices(profile.workspaceId)

  const requestedServiceId = typeof query.service === 'string' ? query.service : undefined
  const selected = services.find((s) => s.id === requestedServiceId) ?? services[0]

  const slots = selected
    ? await getAvailableSlots({ profile, durationMinutes: selected.durationMinutes })
    : []

  const byDate = groupSlotsByDate(slots)
  const hasContact = Boolean(profile.contactEmail || profile.contactPhone)
  const timezoneLabel = profile.timezone === 'Asia/Hong_Kong' ? '香港時間' : '老師所在地時間'
  const initials = profile.displayName.trim().slice(0, 2).toUpperCase()
  const noticeHours = Math.floor(profile.minNoticeMinutes / 60)
  const noticeMinutes = profile.minNoticeMinutes % 60
  const noticeDuration = [noticeHours > 0 ? `${noticeHours} 小時` : '', noticeMinutes > 0 ? `${noticeMinutes} 分鐘` : ''].filter(Boolean).join(' ')
  const firstSlot = slots[0]
  const firstSlotLabel = firstSlot
    ? `${formatInZone(firstSlot.startAt, profile.timezone, 'M月d日')} ${formatTimeInZone(firstSlot.startAt, profile.timezone)}`
    : null
  const noticeText = profile.minNoticeMinutes > 0
    ? `須至少提前 ${noticeDuration} 預約。${firstSlotLabel ? `按目前時間及老師行程，最早可選 ${firstSlotLabel}。` : '目前通知時間內沒有可選時段。'}`
    : undefined
  const pickerDays: PublicSlotDay[] = byDate.map(({ date, slots: daySlots }) => {
    const parsed = new Date(`${date}T00:00:00Z`)
    return {
      date,
      shortDate: `${parsed.getUTCMonth() + 1}月${parsed.getUTCDate()}日`,
      weekday: WEEKDAY_LABELS[parsed.getUTCDay()].replace('星期', '週'),
      slots: daySlots.map((slot) => {
        const time = formatTimeInZone(slot.startAt, profile.timezone)
        const hour = Number(time.split(':')[0])
        return {
          iso: slot.startAt.toISOString(),
          time,
          period: hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
        }
      }),
    }
  })

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      {preview && (
        <div className="mb-5 rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm text-brand-strong">
          <strong>老師預覽模式</strong>：只有你登入後可看見。這裡不能提交查詢；請在分享設定確認發佈狀態。
          <Link href="/dashboard/settings/share" className="ml-2 font-semibold underline">返回分享設定</Link>
        </div>
      )}
      <header className="mb-5">
        <div className="flex items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-strong to-brand text-base font-bold text-white shadow-sm">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{profile.displayName}</h1>
            <p className="mt-0.5 text-xs font-semibold text-brand">{preview ? '老師預覽' : '✓ 已發佈預約頁'}</p>
          </div>
        </div>
        {profile.bio && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-ink-muted">{profile.bio}</p>}
      </header>

      <div className="mb-5 flex gap-2 rounded-2xl bg-brand-soft p-3 text-xs leading-5 text-brand-strong">
        <span aria-hidden="true">ⓘ</span>
        <p>選好時間後提交查詢，<strong>收到老師確認後預約才正式成立</strong>。</p>
      </div>

      {services.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">目前沒有開放預約的課堂。</p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="service-heading" className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="service-heading" className="text-base font-semibold text-ink">
                {services.length > 1 ? '選擇課堂' : '課堂資料'}
              </h2>
              <span className="text-xs text-ink-subtle">{timezoneLabel}</span>
            </div>

            <ul className="flex flex-col gap-2">
              {services.map((service) => {
                const isSelected = service.id === selected?.id

                return (
                  <li key={service.id}>
                    <Link
                      href={`/book/${profile.slug}?service=${service.id}${preview ? '&preview=1' : ''}`}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`block rounded-2xl border p-4 transition-colors ${
                        isSelected
                          ? 'border-brand bg-brand/5'
                          : 'border-line bg-surface hover:border-ink-subtle'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink">{service.name}</span>
                        <span className="text-sm text-ink-muted">
                          {service.durationMinutes} 分鐘
                        </span>
                      </div>
                      {service.description && (
                        <p className="mt-1 text-sm text-ink-subtle">{service.description}</p>
                      )}
                      {isSelected && services.length > 1 && <p className="mt-1 text-xs font-medium text-brand-strong">✓ 已選擇</p>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-label="選擇預約日期及時間">
            {byDate.length === 0 ? (
              <Card>
                {noticeText && <div className="mb-3 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-medium leading-5 text-amber-950"><span aria-hidden="true">⏱</span><p>{noticeText}</p></div>}
                <p className="text-sm text-ink-muted">
                  這段期間暫時沒有可預約的時間，請過幾天再看看
                  {hasContact ? '，或直接聯絡老師。' : '。'}
                </p>

                {hasContact && (
                  <div className="mt-3 flex flex-col gap-1 text-sm">
                    {profile.contactEmail && (
                      <a href={`mailto:${profile.contactEmail}`} className="text-brand underline">
                        {profile.contactEmail}
                      </a>
                    )}
                    {profile.contactPhone && (
                      <a href={`tel:${profile.contactPhone}`} className="text-brand underline">
                        {profile.contactPhone}
                      </a>
                    )}
                  </div>
                )}
              </Card>
            ) : (
              <PublicSlotPicker days={pickerDays} slug={profile.slug} serviceId={selected!.id} noticeText={noticeText} preview={preview} />
            )}
          </section>
        </>
      )}

    </main>
  )
}
