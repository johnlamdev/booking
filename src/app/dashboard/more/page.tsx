import Link from 'next/link'
import type { Metadata } from 'next'

import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '更多設定' }

const ITEMS = [
  { href: '/dashboard/services', title: '服務', description: '管理課堂名稱、內容及長度', icon: '▦' },
  { href: '/dashboard/settings/profile', title: '公開資料', description: '更新學生看到的名稱、簡介及聯絡方式', icon: '◎' },
  { href: '/dashboard/settings/share', title: '分享與發佈', description: '預覽、發佈及分享你的預約頁', icon: '↗' },
] as const

export default async function MorePage() {
  const ctx = await requireWorkspaceContext()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-medium text-brand">設定</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">更多</h1>
      </div>

      <nav aria-label="更多設定">
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {ITEMS.map((item) => (
            <li key={item.href} className="border-b border-line last:border-0">
              <Link href={item.href} className="flex min-h-20 items-center gap-4 px-4 py-3 hover:bg-canvas">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft font-semibold text-brand-strong">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-ink">{item.title}</strong>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{item.description}</span>
                </span>
                <span aria-hidden="true" className="text-brand">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-ink-subtle">目前帳號</p>
        <p className="mt-1 text-sm font-medium text-ink">{ctx.email}</p>
      </div>
    </div>
  )
}
