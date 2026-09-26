# 約課易

約課易是給獨立老師使用的預約查詢 SaaS。老師分享自己的公開預約頁，學生毋須註冊，選擇時段並留下姓名及 WhatsApp 號碼；老師確認後，課堂才正式成立。

> **查詢不等於預約。** `PENDING` 不會佔用時段，只有 `CONFIRMED` 才會佔用老師時間。

目前為封閉測試版本。部署時請自行設定環境變數及網域。

## 目前產品範圍

- 一對一私人課；暫不包括小組班、付款、套票、等候名單或外部日曆同步。
- 老師可設定公開資料、服務、每週開放時間、指定日期休假及公開頁網址。
- 新 workspace 預設建立「60 分鐘私人課」、每天 `09:00–21:00` 開放、60 分鐘起始間隔、最少提前 120 分鐘及 60 天預約範圍，並立即發佈公開頁。
- 學生只需姓名及 WhatsApp 號碼，可選填備註；不需帳號、email 或額外同意 checkbox。
- 老師在查詢頁使用「確認／拒絕／回覆」三個主要操作；可先修改範本，再開啟 WhatsApp 傳送。
- 確認一個查詢後，同時段或重疊時間的其他待處理查詢會標記為時段衝突。
- 已設為不開放的日期會顯示紅色警告，server 亦會阻止確認；已有課堂則保留並清楚提示。
- 老師可新增、修改、搜尋及封存學生，並查看每位學生的約堂紀錄。
- 日曆可由學生名冊選擇「姓名＋WhatsApp」代學生新增課堂。
- 今日頁提供未來 7 天摘要；點選某日或日曆項目會聚焦該日／該筆記錄。

## 邀請測試模式

公開註冊與忘記密碼預設關閉。測試帳號必須由管理員建立，並在 Supabase `app_metadata` 設定：

```json
{ "booking_access": "tester" }
```

建立單一測試老師：

```bash
set -a
source .env.local
set +a
pnpm test-teacher:create
```

腳本會讀取 `TEST_TEACHER_EMAIL` 與 `TEST_TEACHER_PASSWORD`，建立 Auth 帳號後立即預先建立 workspace、預設服務、開放時間及 12 位固定測試學生，但不會在輸出顯示密碼。重複執行會沿用既有帳號及 workspace。帳號密碼只應透過安全渠道交付，不應寫進 repository。

老師**首次進入後台**時會先看到準備畫面；系統在獨立 request 以當日為基準批次建立 `tester-v1` 的相對日期資料，完成後自動進入 dashboard。因此邀請日期與首次登入日期可以不同，也不會令登入頁或第一個 dashboard 回應長時間空白。資料包括：

- 12 位清楚標示「【測試】」的學生；每位有 1–10 筆紀錄。
- 合共 74 筆體驗紀錄，包括 20 筆未來 7 天的待處理查詢（每天 1–5 筆）、30 筆未來 14 天的已確認課堂，以及過往已確認、取消、拒絕與衝突紀錄。
- 同一時段查詢、與已確認課堂重疊的查詢，以及首次登入後第 3 天「不開放但仍有記錄」的情境。
- 示範學生各有不同的假電話；所有 WhatsApp 動作實際改送到 `TEST_WHATSAPP_OVERRIDE_NUMBER`。未設定時，WhatsApp 傳送按鈕會安全停用。

相對日期資料只建立一次；HTML 與 RSC request 同時抵達亦會由 transaction lock 防止重複。現有測試帳號如需重置，應由管理員使用專用維護流程處理，不要直接刪改 production 資料表。

## 技術棧

| 範疇 | 選擇 |
|---|---|
| Web | Next.js 16 App Router、React 19、TypeScript strict |
| UI | Tailwind CSS v4、自建輕量元件、mobile-first |
| Database | Supabase Postgres |
| Data access | Drizzle ORM + postgres.js |
| Auth | Supabase Auth（email + password） |
| Hosting | 支援 Next.js 的部署平台 |
| Tests | Vitest、Docker Postgres、Playwright |

## 本機開發

需求：Node.js 22+、pnpm 10+、Supabase 專案；只有整合測試需要 Docker。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

本機固定使用 [http://localhost:3100](http://localhost:3100)。`NEXT_PUBLIC_APP_URL` 必須與實際網址一致，否則產生的學生狀態連結會錯誤。

### 資料庫

Runtime 的 `DATABASE_URL` 使用 Supabase transaction pooler（port 6543）；migration 的 `DIRECT_DATABASE_URL` 使用 direct connection 或 session pooler（port 5432）。

```bash
pnpm db:migrate
pnpm db:generate
```

Migration 全部位於 `drizzle/` 並進版控。不要手動修改 production schema。

所有業務資料表均啟用 RLS，且刻意不建立 browser policy（deny-all）。瀏覽器的 anon/authenticated key 無法直接讀取業務資料；所有操作經 server 端並檢查 active workspace membership。

## 環境變數

完整說明見 [.env.example](.env.example)。主要類別如下：

- 資料庫：`DATABASE_URL`、`DIRECT_DATABASE_URL`
- Supabase：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
- App：`NEXT_PUBLIC_APP_URL`、`RATE_LIMIT_IP_HEADER`
- 封閉測試：`PUBLIC_SIGNUP_ENABLED`、`PASSWORD_RESET_ENABLED`、`INVITE_TESTING_MODE`、`TEST_WHATSAPP_OVERRIDE_NUMBER`
- 建立測試老師：`TEST_TEACHER_EMAIL`、`TEST_TEACHER_PASSWORD`
- E2E：`E2E_TEST_TEACHER_EMAIL`、`E2E_TEST_TEACHER_PASSWORD`、`E2E_TEST_WORKSPACE_SLUG`、`TEST_DATABASE_URL`

切勿提交 `.env.local`、database password、Supabase Service Role Key 或測試帳號密碼。

## 驗證

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

整合測試使用獨立 Docker Postgres，並有防護避免誤連 Supabase：

```bash
pnpm test:db:up
pnpm test:integration
pnpm test:db:down
```

完整 E2E：

```bash
pnpm test:e2e
```

## 已知限制

- 系統不會自動發送 WhatsApp 或 email。WhatsApp 只會開啟 Click-to-Chat 並預填訊息，老師仍需在 WhatsApp 內按傳送。
- 封閉測試期不提供自行註冊或忘記密碼；帳號與密碼由管理員提供及處理。
- 資料保留、帳號刪除及正式私隱政策尚待產品決定。
- 過期狀態在畫面上會按時間正確推導；`reconcile_expired_inquiries()` 可另以 Supabase `pg_cron` 定期實體化及清理限流紀錄。
- 測試 WhatsApp 統一轉送只適用 `is_experience` workspace；正式帳號必須使用學生的真實 WhatsApp 號碼。
