import Link from 'next/link'

import { Button } from '@/components/ui'
import { DashboardNav } from '@/components/dashboard-nav'
import { logoutAction } from '@/server/auth/actions'
import { requireWorkspaceContext } from '@/server/workspace/context'

/**
 * 後台外框。
 *
 * 這裡呼叫 requireWorkspaceContext() 有兩個作用：
 * 1. 授權——未登入者在此被導向 /login（proxy 的檢查只是樂觀的第一道）。
 * 2. 首次進入時執行冪等 bootstrap，建立 Personal Workspace。
 *
 * 注意：layout 的檢查不可作為子頁面的唯一防線，每個讀寫資料的頁面與
 * server action 都必須自行呼叫一次（規格 §13.1）。React cache 令重複呼叫不額外查庫。
 */
export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const ctx = await requireWorkspaceContext()

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-ink">
            <span className="grid size-8 place-items-center rounded-xl bg-brand text-sm text-white">約</span>
            <span>約課易</span>
          </Link>
          <DashboardNav />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ink-muted sm:inline">{ctx.displayName}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                登出
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:max-w-5xl md:py-8 md:pb-10">
        {children}
      </main>
    </div>
  )
}
