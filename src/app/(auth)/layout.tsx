import Link from 'next/link'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-bold text-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-sm text-white">約</span>
          約課易
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xl shadow-brand/5">{children}</div>
      </div>
    </main>
  )
}
