'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'

const PRIMARY_ITEMS = [
  { href: '/dashboard', label: '今日', icon: 'home', exact: true },
  { href: '/dashboard/inquiries', label: '查詢', icon: 'message' },
  { href: '/dashboard/availability', label: '日曆', icon: 'calendar' },
  { href: '/dashboard/students', label: '學生', icon: 'students' },
] as const

const MORE_ITEMS = [
  { href: '/dashboard/services', label: '服務' },
  { href: '/dashboard/settings/profile', label: '公開資料' },
  { href: '/dashboard/settings/share', label: '分享與發佈' },
] as const

function isCurrent(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname.startsWith(href)
}

type NavIconName = (typeof PRIMARY_ITEMS)[number]['icon'] | 'more'

function NavIcon({ name }: { name: NavIconName }) {
  const commonProps = {
    'aria-hidden': true,
    className: 'size-[22px]',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'home') {
    return <svg {...commonProps}><path d="M3.75 10.5 12 3.75l8.25 6.75v8.25a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.5-1.5V10.5Z" /><path d="M9.25 20.25v-6h5.5v6" /></svg>
  }

  if (name === 'message') {
    return <svg {...commonProps}><path d="M5 18.25 3.75 21l3.5-1.25h10.5a2.5 2.5 0 0 0 2.5-2.5V6.5A2.5 2.5 0 0 0 17.75 4H6.25a2.5 2.5 0 0 0-2.5 2.5v9.25A2.5 2.5 0 0 0 5 18.25Z" /><path d="M8 9h8M8 13h5" /></svg>
  }

  if (name === 'calendar') {
    return <svg {...commonProps}><rect x="3.75" y="5.25" width="16.5" height="15" rx="2.25" /><path d="M8 3.75v3M16 3.75v3M3.75 9.25h16.5M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>
  }

  if (name === 'students') {
    return <svg {...commonProps}><circle cx="9" cy="8" r="3.25" /><path d="M3.75 20v-1.75A4.25 4.25 0 0 1 8 14h2a4.25 4.25 0 0 1 4.25 4.25V20M15.25 5.25a3.25 3.25 0 0 1 0 6.5M16.25 14a4 4 0 0 1 4 4v2" /></svg>
  }

  return <svg {...commonProps}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
}

/** 固定佔位，切頁時顯示；不會令文字或 icon 跳動。 */
function NavPendingIndicator({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus()

  return (
    <span
      aria-hidden="true"
      className={`size-3 shrink-0 rounded-full border-2 border-current border-r-transparent transition-opacity ${
        pending ? 'opacity-100 motion-safe:animate-spin' : 'opacity-0'
      } ${className}`}
    />
  )
}

export function DashboardNav() {
  const pathname = usePathname()
  const isMore = pathname.startsWith('/dashboard/more') || MORE_ITEMS.some((item) => isCurrent(pathname, item.href))

  return (
    <>
      <nav aria-label="主要導覽" className="hidden md:block">
        <ul className="flex items-center gap-1">
          {[...PRIMARY_ITEMS, ...MORE_ITEMS].map((item) => {
            const active = isCurrent(pathname, item.href, 'exact' in item && item.exact)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors ${
                    active ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                  }`}
                >
                  <span>{item.label}</span>
                  <NavPendingIndicator />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <nav
        aria-label="手機主要導覽"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY_ITEMS.map((item) => {
            const active = isCurrent(pathname, item.href, 'exact' in item && item.exact)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${
                    active ? 'font-semibold text-brand' : 'text-ink-subtle'
                  }`}
                >
                  <span className={`relative grid h-7 min-w-10 place-items-center rounded-full transition-colors ${active ? 'bg-brand-soft' : ''}`}>
                    <NavIcon name={item.icon} />
                    <NavPendingIndicator className="absolute -right-0.5 -top-0.5 bg-surface" />
                  </span>
                  {item.label}
                </Link>
              </li>
            )
          })}
          <li>
            <Link
              href="/dashboard/more"
              aria-current={isMore ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${
                isMore ? 'font-semibold text-brand' : 'text-ink-subtle'
              }`}
            >
              <span className={`relative grid h-7 min-w-10 place-items-center rounded-full transition-colors ${isMore ? 'bg-brand-soft' : ''}`}>
                <NavIcon name="more" />
                <NavPendingIndicator className="absolute -right-0.5 -top-0.5 bg-surface" />
              </span>
              更多
            </Link>
          </li>
        </ul>
      </nav>
    </>
  )
}
