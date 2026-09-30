'use client'

import { useActionState } from 'react'

import { respondToStudentRescheduleAction, type RescheduleActionState } from '@/server/inquiries/reschedule-actions'

import { Alert } from './ui'

export function TeacherRescheduleResponse({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState<RescheduleActionState, FormData>(
    respondToStudentRescheduleAction, null,
  )
  return <div className="mt-3 space-y-2">
    {state?.error && <Alert tone="error">{state.error}</Alert>}
    {state?.success ? <><Alert tone="success">{state.success}</Alert>{state.whatsAppUrl && <a href={state.whatsAppUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white">開啟 WhatsApp 通知學生 →</a>}</> : <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <button type="submit" name="decision" value="accept" disabled={pending} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">接受新時間</button>
      <button type="submit" name="decision" value="decline" disabled={pending} className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50">維持原時間</button>
    </form>}
  </div>
}
