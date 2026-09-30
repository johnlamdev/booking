import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: '使用條款' }

export default function TermsPage() {
  return <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-sm leading-7 text-ink-muted sm:py-16">
    <Link href="/" className="text-brand">← 返回約課易</Link>
    <h1 className="mt-7 text-3xl font-bold text-ink">使用條款</h1>
    <p className="mt-2 text-xs">更新日期：2026 年 10 月 1 日</p>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">服務內容</h2>
      <p>約課易提供老師設定課堂和開放時間、讓學生提交預約查詢的工具。學生提交查詢不代表課堂已成立；須由老師確認。課堂安排、費用和與學生的溝通由老師及學生自行協定。約課易目前不處理付款。</p>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">帳號與資料</h2>
      <p>老師應使用自己有權管理的帳號及日曆，妥善保管登入資料，並只提交有權處理的學生資料。請勿使用本服務發送騷擾、欺詐或違法內容。老師分享預約頁前，應向學生說明資料如何用於預約安排，並保持課堂及聯絡資料準確。</p>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">Google Calendar 與第三方服務</h2>
      <p>Google Calendar 連接由老師自行授權，並可在約課易中斷連接。WhatsApp、Google、Supabase、Resend 和 Vercel 各自提供相關服務；其可用性及使用條件亦受各服務供應商的政策影響。同步失敗時，請以約課易的預約狀態核對課堂，並按需要重新同步。</p>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">測試階段與聯絡</h2>
      <p>約課易目前處於公開測試階段，功能可能調整或短暫中斷。發現錯誤或需要處理帳號及資料，請電郵 <a className="text-brand underline" href="mailto:johnlamhk852@gmail.com">johnlamhk852@gmail.com</a>。我們會在此頁公布條款更新日期。</p>
    </section>
  </main>
}
