import Link from 'next/link'
import type { Metadata } from 'next'

import { Card } from '@/components/ui'
import { getDashboardOverview } from '@/server/dashboard/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '概覽' }

function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

/**
 * 設定進度。目前只有第一項可完成，其餘在後續階段接上。
 * 「尚未開放」的項目刻意不做連結，避免指向不存在的頁面。
 */
type SetupStep = {
  label: string
  description: string
  href?: string
  done: boolean
  available: boolean
  optional?: boolean
}

export default async function DashboardPage() {
  const ctx = await requireWorkspaceContext()

  const today = todayInZone(ctx.timezone)
  const overview = await getDashboardOverview({
    workspaceId: ctx.workspaceId,
    instructorId: ctx.instructorProfileId,
    timeZone: ctx.timezone,
    fromDate: today,
    slotIntervalMinutes: ctx.slotIntervalMinutes,
    minNoticeMinutes: ctx.minNoticeMinutes,
  })
  const { activeServiceCount, openWeekdays, pendingCount, daySummaries } = overview

  // 隨機 slug 以 t- 開頭，代表老師尚未自訂
  const hasCustomSlug = !/^t-[a-z0-9]{6}$/.test(ctx.workspaceSlug)
  const steps: SetupStep[] = [
    {
      // 標籤必須反映實際的完成條件——這一項判斷的是 slug 是否已自訂，
      // 叫「設定公開資料」會讓人以為填了名稱和簡介就算完成。
      label: '自訂公開頁網址（選填）',
      description: hasCustomSlug
        ? `目前是 /book/${ctx.workspaceSlug}`
        : `目前是系統產生的 /book/${ctx.workspaceSlug}，可改成好記的名稱`,
      href: '/dashboard/settings/profile',
      done: hasCustomSlug,
      available: true,
      optional: true,
    },
    {
      label: '建立服務',
      description:
        activeServiceCount > 0
          ? `已有 ${activeServiceCount} 項啟用中的服務`
          : '例如「60 分鐘私人課」',
      href: '/dashboard/services',
      done: activeServiceCount > 0,
      available: true,
    },
    {
      label: '設定開放時間',
      description:
        openWeekdays > 0
          ? `每週有 ${openWeekdays} 天開放`
          : '設定你每週固定開放的時間',
      href: '/dashboard/availability',
      done: openWeekdays > 0,
      available: true,
    },
    {
      label: '發佈公開頁',
      description: ctx.isPublic ? '學生可以提交預約查詢' : '取得可分享給學生的連結',
      href: '/dashboard/settings/share',
      done: ctx.isPublic,
      available: true,
    },
  ]
  // 選填項目不應令已可分享的新帳戶一直顯示「尚未完成設定」。
  const setupComplete = steps.every((step) => step.done || !step.available || step.optional)
  const publicPath = `/book/${ctx.workspaceSlug}`

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-brand">今日概覽</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">你好，{ctx.displayName}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
        <Card className="border-0 bg-gradient-to-br from-brand-strong to-brand text-white shadow-lg shadow-brand/15">
          <p className="text-sm text-white/75">需要你處理</p>
          <div className="mt-2 flex items-end gap-2">
            <strong className="text-4xl font-bold leading-none">{pendingCount}</strong>
            <span className="pb-0.5 text-sm text-white/80">個新查詢</span>
          </div>
          <Link
            href="/dashboard/inquiries"
            className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-brand-strong"
          >
            {pendingCount > 0 ? '立即處理 →' : '查看查詢'}
          </Link>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">公開預約頁</p>
            <p className="mt-1 text-xs text-ink-muted">
              {ctx.isPublic ? '已發佈，學生可以提交查詢' : '尚未發佈'}
            </p>
          </div>
          <div className="mt-5 flex gap-2">
            <Link href={publicPath} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-line px-3 text-sm font-semibold text-ink">
              預覽
            </Link>
            <Link href="/dashboard/settings/share" className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-brand-soft px-3 text-sm font-semibold text-brand-strong">
              分享
            </Link>
          </div>
        </Card>
      </div>

      <section aria-labelledby="upcoming-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="upcoming-heading" className="text-base font-semibold text-ink">未來 7 天</h2>
            <p className="mt-0.5 text-xs text-ink-subtle">課堂容量、已確認及待處理查詢</p>
          </div>
          <Link href={`/dashboard/availability?view=week&date=${today}`} className="text-sm font-medium text-brand">查看週曆</Link>
        </div>
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line">
            {daySummaries.map((day, index) => {
              const isUnavailable = day.state !== 'OPEN'
              const isFull = day.state === 'OPEN' && day.capacity > 0 && day.confirmedCount >= day.capacity
              const hasNoBookableSlots = day.state === 'OPEN' && day.availableCount === 0
              const existingOnClosedDay = day.state === 'CLOSED' && (day.confirmedCount > 0 || day.pendingCount > 0)
              return (
                <li key={day.date}>
                  <Link
                    href={`/dashboard/availability?view=day&date=${day.date}`}
                    className="grid min-h-16 grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.6fr)_auto] items-center gap-3 px-4 py-3 hover:bg-brand-soft/40 sm:px-5"
                    aria-label={`${dayLabel(day.date)}，查看當日日曆`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {index === 0 && <span className="mr-1 text-brand">今日</span>}
                        {dayLabel(day.date)}
                      </p>
                      {isUnavailable && (
                        <p className="mt-0.5 text-xs font-medium text-ink-subtle">
                          {day.state === 'CLOSED' ? '不開放' : '未設定開放時間'}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 text-sm">
                      {isUnavailable ? (
                        existingOnClosedDay ? (
                          <p className="font-semibold text-danger">⚠ 不開放，但仍有 {day.confirmedCount} 堂及 {day.pendingCount} 個查詢</p>
                        ) : <p className="text-ink-muted">沒有可預約課堂</p>
                      ) : (
                        <p className="text-ink">
                          已確認 <strong>{day.confirmedCount}</strong> / 可安排 {day.capacity}
                          <span className={`ml-2 text-xs font-semibold ${hasNoBookableSlots ? 'text-danger' : 'text-brand'}`}>
                            {isFull
                              ? '已滿'
                              : hasNoBookableSlots
                                ? index === 0 ? '今日已截止' : '暫無可預約'
                                : `尚餘 ${day.availableCount}`}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-right">
                      <span className={`text-sm font-semibold ${day.pendingCount > 0 ? 'text-danger' : 'text-ink-muted'}`}>
                        查詢 {day.pendingCount}
                      </span>
                      <span aria-hidden="true" className="text-lg text-ink-subtle">›</span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      </section>

      {!setupComplete && <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">完成首次設定</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-3">
              {/* 狀態同時以符號與文字表達，不單靠顏色（規格 §13.4） */}
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                  step.done
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-canvas text-ink-subtle'
                }`}
              >
                {step.done ? '✓' : ''}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {step.href ? (
                    <Link href={step.href} className="text-sm font-medium text-brand underline">
                      {step.label}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-ink-muted">{step.label}</span>
                  )}

                  <span className="text-xs text-ink-subtle">
                    {step.done ? '已完成' : step.available ? '待完成' : '尚未開放'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-subtle">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>}

      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="mb-3 text-base font-semibold text-ink">快速操作</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/dashboard/availability/settings#weekly-heading" className="rounded-2xl border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-sm hover:border-brand/30">◷ 調整時間</Link>
          <Link href="/dashboard/availability/settings#exceptions-heading" className="rounded-2xl border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-sm hover:border-brand/30">＋ 設定休息</Link>
          <Link href="/dashboard/services" className="rounded-2xl border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-sm hover:border-brand/30">▦ 管理服務</Link>
          <Link href="/dashboard/settings/profile" className="rounded-2xl border border-line bg-surface p-4 text-sm font-semibold text-ink shadow-sm hover:border-brand/30">◎ 公開資料</Link>
        </div>
      </section>
    </div>
  )
}
