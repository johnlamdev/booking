import Link from 'next/link'

import { Button } from '@/components/ui'
import { isPublicSignupEnabled } from '@/server/app-config'

export default function HomePage() {
  const signupEnabled = isPublicSignupEnabled()
  return (
    <main className="flex-1">
      <header className="border-b border-line/70 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-ink">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-sm text-white">約</span>
            約課易
          </Link>
          <Link href="/login" className="text-sm font-semibold text-ink-muted hover:text-ink">登入</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-24">
        <div>
          <p className="text-sm font-semibold text-brand">為私人導師而設的預約查詢頁</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            少一點來回問時間，<br className="hidden sm:block" />多一點專心教學。
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-ink-muted">
            設定你的課堂及可預約時間，分享一條連結給學生。學生自行選時段，你確認後才正式成立。
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={signupEnabled ? '/signup' : '/login'}><Button className="w-full px-6 sm:w-auto">{signupEnabled ? '免費建立預約頁' : '獲邀老師登入'}</Button></Link>
            <Link href="/login"><Button variant="secondary" className="w-full px-6 sm:w-auto">已有帳號，登入</Button></Link>
          </div>
          <p className="mt-4 text-xs text-ink-subtle">學生毋須註冊 · 你保留每次預約的決定權</p>
        </div>

        <div className="rounded-[2rem] border border-line bg-surface p-4 shadow-2xl shadow-brand/10 sm:p-6">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-strong to-brand font-bold text-white">JL</span>
            <div><p className="font-bold text-ink">John 老師</p><p className="text-xs text-brand">私人英語導師</p></div>
          </div>
          <p className="mt-5 text-sm font-semibold text-ink">選擇日期</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {['10|週一', '11|週二', '12|週三', '14|週五', '15|週六'].map((value, index) => {
              const [date, day] = value.split('|')
              return <div key={value} className={`rounded-xl border px-1 py-2 text-center ${index === 0 ? 'border-brand bg-brand text-white' : 'border-line'}`}><strong className="block text-lg">{date}</strong><span className="text-[10px] opacity-70">{day}</span></div>
            })}
          </div>
          <p className="mt-5 text-sm font-semibold text-ink">可選時間</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['10:00', '11:00', '12:00', '14:00', '15:30', '17:00'].map((time, index) => <div key={time} className={`rounded-xl border px-2 py-3 text-center text-sm font-semibold ${index === 1 ? 'border-brand bg-brand text-white' : 'border-line text-ink'}`}>{time}</div>)}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          {[
            ['1', '設定課堂與時間', '一次設定每週常規時間，休假時再加入特別安排。'],
            ['2', '分享你的預約頁', '把專屬連結傳給學生，不再逐個訊息對時間。'],
            ['3', '收到查詢再確認', '查看學生資料和時段，由你接受或拒絕。'],
          ].map(([number, title, copy]) => <div key={number} className="flex gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-sm font-bold text-brand-strong">{number}</span><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-1 text-sm leading-6 text-ink-muted">{copy}</p></div></div>)}
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 py-8 text-sm text-ink-muted">
        <Link href="/privacy" className="hover:text-ink">私隱政策</Link>
        <Link href="/terms" className="hover:text-ink">使用條款</Link>
        <a href="mailto:johnlamhk852@gmail.com" className="hover:text-ink">聯絡我們</a>
      </footer>
    </main>
  )
}
