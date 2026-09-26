'use client'

import { useActionState, useEffect, useRef } from 'react'

import { prepareWorkspaceAction } from '@/server/workspace/preparation'

export function WorkspacePreparation({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(prepareWorkspaceAction, null)
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    formRef.current?.requestSubmit()
  }, [])

  useEffect(() => {
    if (state?.ready) window.location.replace(nextPath)
  }, [nextPath, state?.ready])

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <section className="w-full max-w-sm rounded-3xl border border-line bg-surface p-7 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-2xl font-bold text-white">約</div>
        <h1 className="mt-5 text-xl font-bold text-ink">正在準備你的測試工作室</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          我們正在加入學生、查詢及未來課堂。首次登入可能需要數秒，完成後會自動進入。
        </p>

        <form ref={formRef} action={action} className="mt-6">
          {state?.error ? (
            <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-left text-sm text-danger">
              <p>{state.error}</p>
              <button
                type="submit"
                disabled={pending}
                className="mt-3 min-h-11 rounded-xl bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {pending ? '重試中…' : '重新嘗試'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-sm font-medium text-brand-strong" role="status" aria-live="polite">
              <span className="size-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand" aria-hidden="true" />
              {pending ? '正在建立體驗資料…' : '正在連接…'}
            </div>
          )}
        </form>

        <p className="mt-5 text-xs text-ink-subtle">請保持此頁開啟，毋須重新整理。</p>
      </section>
    </main>
  )
}
