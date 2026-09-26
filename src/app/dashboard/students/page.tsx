import type { Metadata } from 'next'
import Link from 'next/link'

import { formatInZone } from '@/lib/time'
import { listStudents } from '@/server/students/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '學生｜約課易' }

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireWorkspaceContext()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const page = typeof params.page === 'string' ? Number(params.page) || 1 : 1
  const archived = params.view === 'archived'
  const result = await listStudents(ctx.workspaceId, { search: q, page, archived })
  const href = (nextPage: number) => `/dashboard/students?${new URLSearchParams({ ...(q ? { q } : {}), ...(archived ? { view: 'archived' } : {}), page: String(nextPage) })}`

  return <main className="mx-auto max-w-5xl px-4 py-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-zinc-500">學生名冊</p><h1 className="text-2xl font-semibold">按學生查看約堂情況</h1><p className="mt-2 text-sm text-zinc-600">公開查詢及老師新增的課堂會自動整理到相同學生。</p></div><Link href="/dashboard/students/new" className="rounded-xl bg-zinc-900 px-5 py-3 font-medium text-white">＋ 新增學生</Link></div>
    <div className="mb-4 flex gap-2 text-sm"><Link href="/dashboard/students" className={`rounded-full px-4 py-2 ${!archived ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}>現有學生</Link><Link href="/dashboard/students?view=archived" className={`rounded-full px-4 py-2 ${archived ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}>已封存</Link></div>
    <form className="mb-6 flex gap-2" action="/dashboard/students"><input type="hidden" name="view" value={archived ? 'archived' : ''} /><label className="sr-only" htmlFor="student-search">搜尋學生</label><input id="student-search" name="q" defaultValue={q} placeholder="搜尋姓名或 WhatsApp 號碼" className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3" /><button className="rounded-xl bg-zinc-900 px-5 py-3 font-medium text-white">搜尋</button></form>
    {result.rows.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-zinc-600">{q ? '找不到相符學生。' : archived ? '沒有已封存學生。' : '收到第一個查詢後，學生會自動出現在這裡。'}</div> : <div className="space-y-3">{result.rows.map((student) => <Link key={student.id} href={`/dashboard/students/${student.id}`} className="block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-400"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-zinc-950">{student.displayName}</h2><p className="mt-1 text-sm text-zinc-500">{student.phone ? `WhatsApp：${student.phone}` : '未有 WhatsApp 號碼'}</p></div><span aria-hidden>›</span></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-700"><span>待處理：{student.pendingCount}</span><span>未來課堂：{student.upcomingConfirmedCount}</span><span>全部紀錄：{student.totalCount}</span></div><p className="mt-2 text-sm text-zinc-500">下堂：{student.nextClassAt ? formatInZone(student.nextClassAt, ctx.timezone, 'dd/MM/yyyy HH:mm') : '未安排'}</p></Link>)}</div>}
    {result.pages > 1 && <nav aria-label="學生分頁" className="mt-6 flex items-center justify-between"><span className="text-sm text-zinc-500">第 {result.page} / {result.pages} 頁，共 {result.total} 位</span><div className="flex gap-2">{result.page > 1 && <Link href={href(result.page - 1)} className="rounded-lg border px-4 py-2">上一頁</Link>}{result.page < result.pages && <Link href={href(result.page + 1)} className="rounded-lg border px-4 py-2">下一頁</Link>}</div></nav>}
  </main>
}
