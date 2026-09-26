'use client'

import { useActionState, useState } from 'react'

import { saveExceptionAction, type ScheduleFormState } from '@/server/availability/actions'

import { Alert, Button, Field } from './ui'

export function ExceptionForm({ today }: { today: string }) {
  const [state, formAction, isPending] = useActionState<ScheduleFormState, FormData>(
    saveExceptionAction,
    null,
  )
  const [mode, setMode] = useState<'CLOSED' | 'CUSTOM'>('CLOSED')

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.warning && <Alert tone="notice">⚠ {state.warning}</Alert>}
      {state?.success && <Alert tone="success">已儲存這天的特別安排。</Alert>}
      {state?.requiresConfirmation && <input type="hidden" name="confirmExisting" value={state.confirmationKey} />}

      <Field label="日期" name="date" type="date" required min={today} disabled={isPending} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">這天的安排</legend>

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="radio"
            name="mode"
            value="CLOSED"
            checked={mode === 'CLOSED'}
            onChange={() => setMode('CLOSED')}
            disabled={isPending}
            className="size-4 accent-brand"
          />
          整天不開放（休假、旅行）
        </label>

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="radio"
            name="mode"
            value="CUSTOM"
            checked={mode === 'CUSTOM'}
            onChange={() => setMode('CUSTOM')}
            disabled={isPending}
            className="size-4 accent-brand"
          />
          改用特別時間
        </label>
      </fieldset>

      {mode === 'CUSTOM' && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="開始時間"
            name="startTime"
            type="time"
            step={3600}
            required
            defaultValue="10:00"
            disabled={isPending}
          />
          <Field
            label="結束時間"
            name="endTime"
            type="time"
            step={3600}
            required
            defaultValue="14:00"
            disabled={isPending}
          />
        </div>
      )}

      <Field
        label="備註"
        name="note"
        maxLength={120}
        disabled={isPending}
        hint="選填，只有你看得到，例如「外遊」"
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? '儲存中…' : state?.requiresConfirmation ? '保留現有安排，仍然儲存' : '儲存'}
        </Button>
      </div>

      <p className="text-xs text-ink-subtle">
        同一日期只會保留一筆設定，重複儲存會覆蓋先前的安排。
      </p>
    </form>
  )
}
