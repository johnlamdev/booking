'use client'

import { useActionState } from 'react'

import {
  withdrawStudentRescheduleAction,
  withdrawTeacherRescheduleAction,
  type RescheduleActionState,
} from '@/server/inquiries/reschedule-actions'

import { Alert } from './ui'

export function WithdrawReschedule({ role, bookingId, token }: {
  role: 'teacher' | 'student'
  bookingId?: string
  token?: string
}) {
  const [state, action, pending] = useActionState<RescheduleActionState, FormData>(
    role === 'teacher' ? withdrawTeacherRescheduleAction : withdrawStudentRescheduleAction,
    null,
  )
  return <div className="mt-3 space-y-2">
    {state?.error && <Alert tone="error">{state.error}</Alert>}
    {state?.success ? <Alert tone="success">{state.success}</Alert> : <form action={action}>
      {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
      {token && <input type="hidden" name="token" value={token} />}
      <button type="submit" disabled={pending} className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50">
        {pending ? '撤回中…' : '撤回這次改期提案'}
      </button>
    </form>}
  </div>
}
