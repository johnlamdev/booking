'use client'

import { useActionState } from 'react'

import {
  updateSchedulingSettingsAction,
  type ScheduleFormState,
} from '@/server/availability/actions'

import { Alert, Button, Field } from './ui'

type Props = {
  initial: {
    slotIntervalMinutes: number
    minNoticeMinutes: number
    bookingHorizonDays: number
  }
}

export function SchedulingSettingsForm({ initial }: Props) {
  const [state, formAction, isPending] = useActionState<ScheduleFormState, FormData>(
    updateSchedulingSettingsAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">預約設定已更新。</Alert>}

      <input type="hidden" name="slotIntervalMinutes" value="60" />
      <div className="rounded-xl bg-brand-soft px-3 py-2.5 text-sm text-brand-strong">
        第一版固定只提供整點開始的 60 分鐘課堂。
      </div>

      <Field
        label="最短預約通知（分鐘）"
        name="minNoticeMinutes"
        type="number"
        inputMode="numeric"
        min={0}
        max={10080}
        step={30}
        defaultValue={initial.minNoticeMinutes}
        disabled={isPending}
        hint="學生不能預約此刻起這段時間內的時段。120 代表最少要提早兩小時。"
      />

      <Field
        label="可預約範圍（天）"
        name="bookingHorizonDays"
        type="number"
        inputMode="numeric"
        min={1}
        max={365}
        step={1}
        defaultValue={initial.bookingHorizonDays}
        disabled={isPending}
        hint="學生最多可以看到多少天之後的時段。"
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? '儲存中…' : '儲存設定'}
        </Button>
      </div>
    </form>
  )
}
