'use client'

import { useActionState, useState } from 'react'

import { cancelStudentBookingAction, type StudentCancellationState } from '@/server/inquiries/student-cancellation'

import { Alert } from './ui'

export function StudentBookingCancellation({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<StudentCancellationState, FormData>(
    cancelStudentBookingAction, null,
  )
  if (state?.success) return <div className="mt-4 space-y-3">
    <Alert tone="success">{state.success}</Alert>
    {state.whatsAppUrl && <a href={state.whatsAppUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white">開啟 WhatsApp 通知老師 →</a>}
  </div>
  return <div className="mt-4">
    {state?.error && <Alert tone="error">{state.error}</Alert>}
    {!open ? <button type="button" onClick={() => setOpen(true)} className="min-h-12 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700">取消這堂課</button>
      : <form action={action} className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-red-950">取消後，這個時段會重新開放給其他學生。</p>
        <label htmlFor="student-cancellation-reason" className="block text-sm font-medium text-ink">原因（選填）</label>
        <textarea id="student-cancellation-reason" name="reason" maxLength={200} rows={2} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink" />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? '取消中…' : '確定取消預約'}</button>
          <button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-11 rounded-xl border border-line px-4 text-sm text-ink">返回</button>
        </div>
      </form>}
  </div>
}
