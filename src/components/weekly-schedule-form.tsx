'use client'

import { useActionState, useState } from 'react'

import { WEEKDAY_LABELS } from '@/lib/availability'
import { saveWeeklyScheduleAction, type ScheduleFormState } from '@/server/availability/actions'

import { Alert, Button } from './ui'

type Range = { startTime: string; endTime: string }
type DayState = { enabled: boolean; ranges: Range[] }

const DEFAULT_RANGE: Range = { startTime: '09:00', endTime: '21:00' }

/** 一般教練週一至週五開放，週末休息——作為新帳號的起點，老師再自行調整。 */
function buildInitialState(rules: { weekday: number; startTime: string; endTime: string }[]) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const ranges = rules
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime }))

    return {
      enabled: ranges.length > 0,
      ranges: ranges.length > 0 ? ranges : [DEFAULT_RANGE],
    } satisfies DayState
  })
}

export function WeeklyScheduleForm({
  rules,
}: {
  rules: { weekday: number; startTime: string; endTime: string }[]
}) {
  const [state, formAction, isPending] = useActionState<ScheduleFormState, FormData>(
    saveWeeklyScheduleAction,
    null,
  )
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(rules))
  const [resetPendingSave, setResetPendingSave] = useState(false)

  function updateDay(weekday: number, update: Partial<DayState>) {
    setResetPendingSave(false)
    setDays((prev) => prev.map((d, i) => (i === weekday ? { ...d, ...update } : d)))
  }

  function updateRange(weekday: number, index: number, update: Partial<Range>) {
    setResetPendingSave(false)
    setDays((prev) =>
      prev.map((d, i) =>
        i === weekday
          ? { ...d, ranges: d.ranges.map((r, j) => (j === index ? { ...r, ...update } : r)) }
          : d,
      ),
    )
  }

  function addRange(weekday: number) {
    setResetPendingSave(false)
    setDays((prev) =>
      prev.map((d, i) => (i === weekday ? { ...d, ranges: [...d.ranges, DEFAULT_RANGE] } : d)),
    )
  }

  function removeRange(weekday: number, index: number) {
    setResetPendingSave(false)
    setDays((prev) =>
      prev.map((d, i) =>
        i === weekday ? { ...d, ranges: d.ranges.filter((_, j) => j !== index) } : d,
      ),
    )
  }

  function copyMondayToWeekdays() {
    setResetPendingSave(false)
    setDays((prev) => {
      const monday = prev[1]!
      return prev.map((day, weekday) =>
        weekday >= 1 && weekday <= 5
          ? { enabled: monday.enabled, ranges: monday.ranges.map((range) => ({ ...range })) }
          : day,
      )
    })
  }

  function resetAllDays() {
    setDays((prev) =>
      prev.map((day) => ({
        enabled: false,
        // 保留原本時間，日後重新開啟該天時不用再次輸入。
        ranges: day.ranges,
      })),
    )
    setResetPendingSave(true)
  }

  // 只送出有開放的日子；停用的日子等同沒有規則
  const payload = JSON.stringify(
    days
      .map((day, weekday) => ({ weekday, ranges: day.enabled ? day.ranges : [] }))
      .filter((day) => day.ranges.length > 0),
  )

  return (
    <form
      action={formAction}
      onSubmit={() => setResetPendingSave(false)}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="schedule" value={payload} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">每週時間表已儲存。</Alert>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyMondayToWeekdays}
          disabled={isPending}
          className="rounded-xl bg-brand-soft px-3 py-2 text-xs font-semibold text-brand-strong"
        >
          套用星期一時間至工作日
        </button>
        <button
          type="button"
          onClick={resetAllDays}
          disabled={isPending}
          className="rounded-xl border border-danger/30 bg-surface px-3 py-2 text-xs font-semibold text-danger"
        >
          清除全部常規時間
        </button>
      </div>

      {resetPendingSave && (
        <Alert tone="notice">七天已全部設為休息。按「儲存時間表」後才會正式套用。</Alert>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {days.map((day, weekday) => (
          <li key={weekday}>
            <details className="group">
              <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[4.5rem_1fr_auto] items-center gap-2 py-2 marker:hidden">
                <span className="text-sm font-semibold text-ink">{WEEKDAY_LABELS[weekday]}</span>
                <span className={`truncate text-sm ${day.enabled ? 'text-ink' : 'text-ink-subtle'}`}>
                  {day.enabled
                    ? day.ranges.map((range) => `${range.startTime}–${range.endTime}`).join('、')
                    : '休息'}
                </span>
                <span className="text-xs font-semibold text-brand group-open:hidden">編輯</span>
                <span className="hidden text-xs font-semibold text-brand group-open:inline">收起</span>
              </summary>

              <div className="mb-4 rounded-xl bg-canvas p-3">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(weekday, { enabled: e.target.checked })}
                    disabled={isPending}
                    className="size-4 accent-brand"
                  />
                  <span className="text-sm font-medium text-ink">開放這天</span>
                </label>

                {day.enabled && (
                  <div className="mt-3 flex flex-col gap-2">
                    {day.ranges.map((range, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={range.startTime}
                          step={3600}
                          onChange={(e) => updateRange(weekday, index, { startTime: e.target.value })}
                          disabled={isPending}
                          aria-label={`${WEEKDAY_LABELS[weekday]}第 ${index + 1} 段開始時間`}
                          className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                        />
                        <span aria-hidden="true" className="text-ink-subtle">–</span>
                        <input
                          type="time"
                          value={range.endTime}
                          step={3600}
                          onChange={(e) => updateRange(weekday, index, { endTime: e.target.value })}
                          disabled={isPending}
                          aria-label={`${WEEKDAY_LABELS[weekday]}第 ${index + 1} 段結束時間`}
                          className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                        />
                        {day.ranges.length > 1 && (
                          <button type="button" onClick={() => removeRange(weekday, index)} disabled={isPending} className="shrink-0 text-xs text-ink-subtle underline hover:text-danger">移除</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addRange(weekday)} disabled={isPending} className="self-start text-xs font-medium text-brand underline">加一段時間（例如午休後）</button>
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? '儲存中…' : '儲存時間表'}
        </Button>
      </div>
    </form>
  )
}
