'use client'

import { useActionState } from 'react'

import { proposeStudentRescheduleAction, type RescheduleActionState } from '@/server/inquiries/reschedule-actions'

import { Alert, Button } from './ui'

export function StudentRescheduleForm({ token, slots }: { token: string; slots: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<RescheduleActionState, FormData>(
    proposeStudentRescheduleAction, null,
  )
  if (state?.success) return <div className="space-y-4">
    <Alert tone="success">{state.success}</Alert>
    {state.whatsAppUrl && <a href={state.whatsAppUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white">用 WhatsApp 告知老師 →</a>}
  </div>
  return <form action={action} className="space-y-4">
    {state?.error && <Alert tone="error">{state.error}</Alert>}
    <input type="hidden" name="token" value={token} />
    <label htmlFor="student-new-start" className="block text-sm font-medium text-ink">建議新時間</label>
    <select id="student-new-start" name="startAt" required className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink">
      <option value="">選擇老師的空檔</option>
      {slots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
    </select>
    <p className="text-sm text-ink-muted">老師接受之前，原本時間會繼續保留。新時間不會預先佔用。</p>
    <Button type="submit" disabled={pending || slots.length === 0}>{pending ? '提交中…' : '向老師提出改期'}</Button>
  </form>
}
