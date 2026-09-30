import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: '私隱政策' }

export default function PrivacyPage() {
  return <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-sm leading-7 text-ink-muted sm:py-16">
    <Link href="/" className="text-brand">← 返回約課易</Link>
    <h1 className="mt-7 text-3xl font-bold text-ink">私隱政策</h1>
    <p className="mt-2 text-xs">更新日期：2026 年 10 月 1 日</p>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">我們收集甚麼資料</h2>
      <p>老師建立帳號時，我們處理登入電郵、老師名稱、課堂、可預約時間及老師自行填寫的聯絡資料。學生毋須建立帳號；提交預約查詢時，我們處理學生填寫的姓名、聯絡方式、所選課堂及時間。老師亦可在學生名冊加入備註和管理預約紀錄。</p>
      <p>網站為防止濫用，會按訪客 IP 計算提交次數；限流紀錄只儲存 IP 的雜湊值。服務供應商亦可能按其政策處理連線和寄信所需的技術紀錄。</p>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">資料用途及分享</h2>
      <p>我們使用資料來提供預約查詢、確認、改期、取消、學生紀錄、登入及密碼重設功能。老師可在自己的後台查看其學生及預約資料；學生可透過專屬連結查看或處理自己的查詢。老師主動使用 WhatsApp 分享或聯絡時，資料會按老師的操作傳至 WhatsApp。</p>
      <p>網站由 Vercel 託管，帳號及資料庫由 Supabase 提供，驗證電郵經 Resend 發送。這些服務會為提供相應功能而處理所需資料。我們不出售老師或學生資料。</p>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">Google Calendar</h2>
      <p>只有老師自行選擇連接 Google 帳號時，約課易才會要求管理該帳號自己日曆中事件的授權。我們儲存加密的 Google 續期授權資料，以便持續同步。已確認課堂會建立或更新約課易自己的事件；取消課堂會移除相應事件。我們不讀取或修改其他日曆事件。</p>
      <p>同步事件包括課堂名稱、開始和結束時間，以及返回約課易後台的連結；不包括學生姓名、電話或電郵。中斷連接會刪除我們儲存的授權資料並停止日後同步，已建立的事件會保留在 Google Calendar，老師可自行刪除，也可在 Google 帳號設定撤銷授權。我們不使用 Google 使用者資料作廣告或出售予第三方。</p>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">保留、保護及查詢</h2>
      <p>我們在提供服務期間保留帳號和預約資料。若需查閱、更正或要求刪除資料，請電郵至 <a className="text-brand underline" href="mailto:johnlamhk852@gmail.com">johnlamhk852@gmail.com</a>。學生亦可先聯絡收集其預約資料的老師。收到要求後，我們會核實身份及處理相關資料；如有必須保留的紀錄，會告知原因。</p>
      <p>網站使用 HTTPS 傳輸資料，並加密儲存 Google 續期授權資料。我們可能因功能或服務供應商變動更新本政策，更新後會在此頁標示日期。</p>
    </section>
  </main>
}
