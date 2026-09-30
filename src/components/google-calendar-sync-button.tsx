'use client'

import { useState, useTransition } from 'react'

import { syncGoogleCalendarNowAction } from '@/server/calendar/google-actions'

export function GoogleCalendarSyncButton() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ synced: number; failed: number; nextCursor: string | null } | null>(null)
  const [failedSoFar, setFailedSoFar] = useState(0)
  function syncNext() {
    const continuing = Boolean(result?.nextCursor)
    start(async () => {
      const next = await syncGoogleCalendarNowAction(continuing ? result!.nextCursor! : undefined, continuing && failedSoFar > 0)
      setFailedSoFar((previous) => (continuing ? previous : 0) + next.failed)
      setResult(next)
    })
  }
  return <div className="space-y-2">
    <button type="button" disabled={pending} onClick={syncNext} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? '同步中…' : result?.nextCursor ? '繼續同步下一批課堂' : '同步未來課堂及近期取消'}</button>
    {result && <p className="text-sm text-ink-muted">這一批成功 {result.synced} 筆；失敗 {result.failed} 筆。{result.nextCursor ? '如有更多課堂，請按「繼續同步」。' : '本輪同步已完成。'}{result.failed > 0 ? ' 失敗的課堂可重新同步。' : ''}</p>}
  </div>
}
