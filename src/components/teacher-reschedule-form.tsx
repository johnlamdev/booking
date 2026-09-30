'use client'

import { useActionState } from 'react'

import { proposeTeacherRescheduleAction, type RescheduleActionState } from '@/server/inquiries/reschedule-actions'

import { Alert, Button } from './ui'

type Slot = { value: string; label: string }

export function TeacherRescheduleForm({ bookingId, slots }: { bookingId: string; slots: Slot[] }) {
  const [state, action, pending] = useActionState<RescheduleActionState, FormData>(
    proposeTeacherRescheduleAction, null,
  )

  if (state?.success) return (
    <div className="space-y-4">
      <Alert tone="success">{state.success}</Alert>
      {state.whatsAppUrl ? (
        <a href={state.whatsAppUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white">開啟 WhatsApp 傳送提案 →</a>
      ) : <p className="text-sm text-danger">找不到可用的學生 WhatsApp 號碼，請直接聯絡學生告知改期連結。</p>}
    </div>
  )

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="bookingId" value={bookingId} />
      <label htmlFor="new-start" className="block text-sm font-medium text-ink">建議新時間</label>
      <select id="new-start" name="startAt" required className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink">
        <option value="">選擇可預約時間</option>
        {slots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
      </select>
      <p className="text-sm text-ink-muted">學生接受前，原本課堂仍會保留；建議時段不會預先佔用。</p>
      <Button type="submit" disabled={pending || slots.length === 0}>{pending ? '建立中…' : '提出改期並取得 WhatsApp 訊息'}</Button>
    </form>
  )
}
