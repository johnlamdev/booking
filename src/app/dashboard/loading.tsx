/**
 * Dashboard 動態頁面的即時 fallback。
 *
 * loading.tsx 由 Next.js 預取並以 Suspense streaming 顯示；它不會增加
 * 資料庫請求。共用 header / navigation 仍保持可操作，內容完成後自動替換。
 */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="正在載入頁面"
      className="flex flex-col gap-5"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-brand/15 bg-brand-soft/60 px-4 py-3 text-brand-strong">
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
        />
        <p className="text-sm font-semibold">正在載入最新資料…</p>
      </div>

      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-4 w-20 rounded-full bg-line" />
        <div className="mt-3 h-8 w-44 rounded-xl bg-line" />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="h-36 rounded-2xl border border-line bg-surface" />
          <div className="h-36 rounded-2xl border border-line bg-surface" />
        </div>

        <div className="mt-5 space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="h-5 w-28 rounded-lg bg-line" />
          <div className="h-16 rounded-xl bg-canvas" />
          <div className="h-16 rounded-xl bg-canvas" />
          <div className="h-16 rounded-xl bg-canvas" />
        </div>
      </div>
    </div>
  )
}
