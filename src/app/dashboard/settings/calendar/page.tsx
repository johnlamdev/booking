import Link from 'next/link'

import { GoogleCalendarSyncButton } from '@/components/google-calendar-sync-button'
import { disconnectGoogleCalendarAction } from '@/server/calendar/google-actions'
import { getGoogleCalendarConnectionStatus, isGoogleCalendarConfigured } from '@/server/calendar/google'
import { requireWorkspaceContext } from '@/server/workspace/context'

export default async function CalendarSettingsPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const ctx = await requireWorkspaceContext()
  const query = await searchParams
  const configured = isGoogleCalendarConfigured()
  const { connected, lastSyncError } = await getGoogleCalendarConnectionStatus(ctx.workspaceId)
  return <div className="mx-auto max-w-xl space-y-5">
    <Link href="/dashboard/more" className="text-sm text-brand">← 返回更多設定</Link>
    <h1 className="text-2xl font-semibold text-ink">Google Calendar</h1>
    <p className="text-sm text-ink-muted">請連接你自己的 Google 帳號。連接後，已確認的課堂會加入該帳號的主要日曆；改期會更新時間，取消會移除。待確認查詢不會加入日曆。</p>
    {query.result === 'connected' && <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand-strong">已連接 Google Calendar。</p>}
    {(query.error || (query.result && query.result !== 'connected')) && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">連接未完成，請重新嘗試；如持續失敗，請聯絡網站管理員。</p>}
    {!configured ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">此網站尚未設定 Google Calendar 連接。預約功能仍可正常使用。</p>
      : connected ? <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-brand-strong">已連接</p>
        <p className="text-xs text-ink-muted">只同步約課易的已確認課堂。Google Calendar 中其他安排目前不會反過來遮擋約課易空檔。</p>
        {lastSyncError && <p className="text-sm text-red-700">最近同步失敗：{lastSyncError}。請按「重新同步」，如持續失敗請重新連接。</p>}
        <GoogleCalendarSyncButton />
        <p className="text-xs text-ink-muted">中斷連接後不再更新 Google Calendar；已同步的舊事件會保留，請自行在 Google Calendar 刪除。</p>
        <form action={disconnectGoogleCalendarAction}><button type="submit" className="min-h-10 rounded-xl border border-line px-4 text-sm text-ink">中斷連接</button></form>
      </div> : <a href="/api/google-calendar/connect" className="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white">連接 Google Calendar →</a>}
  </div>
}
