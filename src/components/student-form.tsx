'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { saveStudentAction, type StudentActionState } from '@/server/students/actions'

export function StudentForm({ student }: { student?: { id: string; displayName: string; phone: string | null; notes: string | null } }) {
  const [state, action, pending] = useActionState<StudentActionState, FormData>(saveStudentAction, null)
  const router = useRouter()
  useEffect(() => { if (!student && state?.studentId) router.push(`/dashboard/students/${state.studentId}`) }, [router, state?.studentId, student])
  const input = 'mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3'
  return <form action={action} className="space-y-4">
    <input type="hidden" name="studentId" value={student?.id ?? ''} />
    <label className="block text-sm font-medium">姓名<input name="displayName" required maxLength={80} defaultValue={student?.displayName} className={input} /></label>
    <label className="block text-sm font-medium">WhatsApp 號碼<input name="phone" type="tel" inputMode="tel" required maxLength={40} placeholder="+852 9123 4567" defaultValue={student?.phone ?? ''} className={input} /><span className="mt-1 block text-xs font-normal text-zinc-500">必填，請連國家／地區號碼。</span></label>
    <label className="block text-sm font-medium">老師備註<textarea name="notes" maxLength={500} rows={3} defaultValue={student?.notes ?? ''} className={input} /></label>
    {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}{state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}
    <button disabled={pending} className="rounded-xl bg-zinc-900 px-5 py-3 font-medium text-white disabled:opacity-50">{pending ? '儲存中…' : student ? '儲存修改' : '新增學生'}</button>
  </form>
}
