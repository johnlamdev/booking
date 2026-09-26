import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { StudentForm } from '@/components/student-form'
import { WhatsAppComposer } from '@/components/whatsapp-composer'
import { formatInZone } from '@/lib/time'
import { setStudentArchivedAction } from '@/server/students/actions'
import { getStudentDetail } from '@/server/students/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '學生約堂紀錄｜約課易' }
const labels = { PENDING: '待確認', CONFIRMED: '已確認', REJECTED: '已拒絕', REJECTED_CONFLICT: '時段衝突', EXPIRED: '已過期', CANCELLED: '已取消' } as const

export default async function StudentPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireWorkspaceContext()
  const { studentId } = await params
  const query = await searchParams
  const historyPage = typeof query.history === 'string' ? Number(query.history) || 1 : 1
  if (!z.string().uuid().safeParse(studentId).success) notFound()
  const result = await getStudentDetail(ctx.workspaceId, studentId, historyPage)
  if (!result) notFound()
  const { student, active, history, counts } = result
  const bookingList = (items: typeof active) => items.length ? <div className="space-y-3">{items.map((booking) => <Link key={booking.id} href={`/dashboard/inquiries?inquiry=${booking.id}`} className="block rounded-2xl border border-zinc-200 bg-white p-4 hover:border-zinc-400"><div className="flex justify-between gap-3"><div><p className="font-medium">{formatInZone(booking.startAt, ctx.timezone, 'dd/MM/yyyy HH:mm')}–{formatInZone(booking.endAt, ctx.timezone, 'HH:mm')}</p><p className="mt-1 text-sm text-zinc-500">{booking.serviceName}</p></div><span className={booking.status === 'PENDING' ? 'font-medium text-red-600' : 'text-sm text-zinc-600'}>{labels[booking.status]}</span></div></Link>)}</div> : <p className="rounded-2xl bg-zinc-100 p-5 text-sm text-zinc-500">沒有紀錄。</p>

  return <main className="mx-auto max-w-4xl px-4 py-8"><Link href="/dashboard/students" className="text-sm text-zinc-600">← 返回學生</Link>
    {student.archivedAt && <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">這位學生已封存，約堂歷史仍會保留。</p>}
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{student.displayName}</h1><div className="mt-2 space-y-1 text-sm text-zinc-600">{student.phone ? <p>WhatsApp：{student.phone}</p> : <p className="text-amber-700">尚未補上 WhatsApp 號碼</p>}</div></div><form action={setStudentArchivedAction}><input type="hidden" name="studentId" value={student.id}/><input type="hidden" name="archived" value={student.archivedAt ? 'false' : 'true'}/><button className="rounded-xl border border-zinc-300 px-4 py-3 font-medium">{student.archivedAt ? '恢復學生' : '封存學生'}</button></form></div>
    <div className="mt-4"><WhatsAppComposer phone={ctx.isExperience ? ctx.testWhatsAppOverride : student.phone} message={`${student.displayName} 你好，\n我是 ${ctx.displayName}。`} label="WhatsApp 聯絡學生" testMode={ctx.isExperience} /></div>
    <div className="mt-7 grid grid-cols-3 gap-3">{[['待處理', counts.pending], ['未來課堂', counts.future], ['全部紀錄', counts.total]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-zinc-100 p-4"><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div>
    <section className="mt-8"><h2 className="mb-3 text-lg font-semibold">學生資料</h2><div className="rounded-2xl border border-zinc-200 bg-white p-5"><StudentForm student={student} /></div></section>
    <section className="mt-8"><h2 className="mb-3 text-lg font-semibold">待處理及未來課堂</h2>{bookingList(active)}</section>
    <section className="mt-8"><h2 className="mb-3 text-lg font-semibold">過往及其他紀錄</h2>{bookingList(history)}{result.historyPages > 1 && <div className="mt-4 flex justify-end gap-2">{result.historyPage > 1 && <Link className="rounded-lg border px-4 py-2" href={`?history=${result.historyPage - 1}`}>上一頁</Link>}{result.historyPage < result.historyPages && <Link className="rounded-lg border px-4 py-2" href={`?history=${result.historyPage + 1}`}>下一頁</Link>}</div>}</section>
  </main>
}
