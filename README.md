# 約課易

約課易是一個公開 Beta、可自行安裝的預約查詢網站，適合獨立老師使用。老師設定課堂和可預約時間，分享專屬連結給學生；學生毋須建立帳號，選擇時段並留下姓名及 WhatsApp 號碼。老師確認後，課堂才正式成立。**學生送出的是查詢，並非即時預約；待確認查詢不會佔用時段。**

這個 repository 的原始碼公開，供有興趣的人了解及自行安裝。每位自行部署者需要自己的 Supabase 專案儲存資料，以及自己的網站部署平台。

## Hosted Version（使用已部署的網站）

如果有人提供你已部署的約課易網址，直接開啟網站，按「免費建立預約頁」，以自己的電郵註冊並確認電郵。首次登入後，跟隨首頁引導檢查老師資料、課堂種類及開放時間，預覽預約頁，再把連結分享給學生。忘記密碼可在登入頁申請重設連結。

**本 repository 未提供官方 Hosted Version 網址。** 如果你只拿到 GitHub 連結，請按下面的 Self-hosting 步驟建立自己的網站。不要把測試帳號或示範學生資料用於正式預約。

## Self-hosting（自行安裝）

- **先在自己電腦試用：** 跟隨下面「第一次安裝」。網站只在你的電腦運行，網址是 `http://localhost:3100`。
- **建立公開網站：** 完成本機安裝和測試，再跟隨「放上互聯網」。公開網站需要另外設定網址、電郵發送和部署平台。

安裝過程會用到「終端機」：Mac 的「終端機」或 Windows 的 PowerShell。灰色程式碼框內的指令要逐行貼到終端機執行。以 `#` 開頭的文字是說明，不用輸入。

## 第一次安裝（在自己電腦試用）

### 1. 準備帳號和工具

1. 建立一個 [Supabase 帳號](https://supabase.com/)；稍後會用它建立獨立資料庫和登入系統。
2. 安裝 [Node.js 22 或更新的 LTS 版本](https://nodejs.org/)。安裝後重新開啟終端機，輸入 `node --version`，應看到 `v22` 或更高版本。
3. 在終端機輸入 `corepack enable`，然後輸入 `pnpm --version`。本專案使用 pnpm 10；如果版本不符，可輸入 `corepack prepare pnpm@10.15.1 --activate` 再檢查。
4. 下載本 repository：在 GitHub 頁面按 **Code → Download ZIP**，解壓縮後，把資料夾放在你容易找到的位置。你也可以用 Git clone。
5. 在終端機進入解壓後、含有 `package.json` 的 `booking` 資料夾。例如把資料夾拖到終端機可取得它的完整路徑，然後輸入 `cd ` 加上該路徑。其後的指令都在這個資料夾執行。

Windows PowerShell 如執行 `corepack enable` 出現權限錯誤，請以系統管理員身分開啟 PowerShell 再執行該指令。

### 2. 建立 Supabase 專案

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)，建立新 project。妥善保存你設定的**資料庫密碼**。
2. 開啟該 project，按上方 **Connect**，分別複製：
   - **Transaction pooler** 連線字串，放進稍後的 `DATABASE_URL`（通常使用 port `6543`）。
   - **Session pooler** 連線字串，放進 `DIRECT_DATABASE_URL`（通常使用 port `5432`）。若你的網絡支援 IPv6，也可使用 **Direct connection**。不要把兩條字串互換。
3. 連線字串中的 `[YOUR-PASSWORD]` 要換成你剛才設定的資料庫密碼。若密碼含 `@`、`#`、`&` 等符號，需先做 URL 編碼；最簡單的做法是在建立專案時使用不含這些符號的強密碼。
4. 在 project 的 **Settings → API Keys** 找出 project URL 和 **publishable key**。程式的變數名稱仍叫 `ANON_KEY`，可填入 publishable key；舊版頁面上的 `anon` key 亦可使用。只有管理員要建立 demo 帳號時，才需要另外取得 **secret key**，填入 `SUPABASE_SERVICE_ROLE_KEY`。

Supabase 的畫面可能改版；如找不到上述項目，請參考其[資料庫連線說明](https://supabase.com/docs/guides/database/connecting-to-postgres)及 [API Keys 說明](https://supabase.com/docs/guides/getting-started/api-keys)。

### 3. 填寫設定檔

在 `booking` 資料夾執行：

```bash
pnpm install
cp .env.example .env.local
```

Windows PowerShell 複製檔案的指令是 `Copy-Item .env.example .env.local`。

用文字編輯器打開 `.env.local`，在等號後填入你自己的值。首次本機安裝要填這四項，**不要加引號**：

| 設定 | 填入甚麼 |
|---|---|
| `DATABASE_URL` | Supabase 的 Transaction pooler 連線字串 |
| `DIRECT_DATABASE_URL` | Supabase 的 Session pooler 或 Direct connection 連線字串 |
| `NEXT_PUBLIC_SUPABASE_URL` | 你的 Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 publishable（或 legacy anon）key |

保留 `NEXT_PUBLIC_APP_URL=http://localhost:3100`，並確認以下三項是 `true`、`true`、`false`：

```dotenv
PUBLIC_SIGNUP_ENABLED=true
PASSWORD_RESET_ENABLED=true
INVITE_TESTING_MODE=false
```

這三項讓使用者自行註冊、重設密碼，並建立正常的老師工作空間。正式帳號只會取得預設課堂及開放時間，不會收到測試學生或預約紀錄。不要把 `.env.local` 上傳到 GitHub、傳給其他人，或貼在公開求助訊息中。

### 4. 建立資料表，啟動網站

依次執行：

```bash
pnpm db:migrate
pnpm dev
```

第一個指令會在**你填入的 Supabase project** 建立所需資料表；執行前請再確認 `DIRECT_DATABASE_URL` 指向你自己的新 project。看到 migration 完成且沒有錯誤後，第二個指令會啟動網站。打開 [http://localhost:3100](http://localhost:3100)，按「免費建立預約頁」，以自己的電郵地址註冊。登入後可在設定頁修改老師資料、課堂和開放時間。要停止本機網站，在終端機按 `Ctrl + C`。

本機試用如註冊時無法收到確認電郵，請先用 Supabase project 擁有者的電郵地址測試。Supabase 預設郵件服務只寄給 project 團隊成員；供其他人註冊之前，必須設定自己的 SMTP 郵件服務。

## 放上互聯網（以 Vercel 為例）

公開網站需要 [GitHub](https://github.com/)、[Vercel](https://vercel.com/) 和 Supabase 帳號。以下步驟假設你已完成上面的本機安裝，而且 `pnpm db:migrate` 成功。

1. 在 [本 repository](https://github.com/johnlamdev/booking) 按 **Fork**，建立你自己的副本。不要把 `.env.local` 加進 GitHub。
2. 在 Vercel 建立新 project，匯入你 fork 的 repository。Framework 選 **Next.js**。Vercel 會安裝依賴並執行 build；**部署不會代你執行資料庫 migration**，所以前面的本機步驟不能省略。
3. 在 Vercel 的 project **Environment Variables** 填入 `DATABASE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`，以及 `PUBLIC_SIGNUP_ENABLED=true`、`PASSWORD_RESET_ENABLED=true`、`INVITE_TESTING_MODE=false`。`DIRECT_DATABASE_URL` 只供本機執行 migration 使用；如要在其他地方執行 migration，才在那個安全環境設定它。一般公開網站不需要 `SUPABASE_SERVICE_ROLE_KEY`；它只供本機管理員 demo 建立腳本使用。
4. 第一次部署後，複製 Vercel 給你的正式網址（例如 `https://你的專案.vercel.app`），把 Vercel 的 `NEXT_PUBLIC_APP_URL` 設成該網址，**不加最後的 `/`**，然後重新部署。若稍後改用自訂網域，也要同步更新並重新部署。
5. 在 Supabase 的 **Authentication → URL Configuration**，把 **Site URL** 設成相同的正式網址，並把 `https://你的正式網址/auth/callback` 加入允許的 redirect URLs。地址要按你的真實網域填寫。
6. 在 Supabase 設定[自訂 SMTP 郵件服務](https://supabase.com/docs/guides/auth/auth-smtp)，再用**非 project 團隊成員**的電郵測試註冊、確認信及忘記密碼。預設郵件服務不能用於公開註冊。
7. 用老師帳號建立並分享預約頁，找另一人測試送出查詢、確認及開啟 WhatsApp。WhatsApp 只會預填訊息；老師仍須親自在 WhatsApp 按「傳送」。

正式邀請老師和學生試用前，可按[雙手機試用檢測清單](docs/BETA_TEST_CHECKLIST.md)逐步驗收查詢、改期、取消與 Google Calendar。
目前哪些項目已由程式檢查驗證、哪些仍需部署或實機測試，見 [Beta 驗收狀態](docs/RELEASE_READINESS.md)。

測試／demo 帳號由管理員在本機 `.env.local` 填入 `SUPABASE_SERVICE_ROLE_KEY`、`TEST_TEACHER_EMAIL`、`TEST_TEACHER_PASSWORD`，再執行 `pnpm test-teacher:create` 建立，須使用**與正式老師不同的電郵**。腳本會標記獨立的體驗工作空間，測試資料及 WhatsApp 轉送只適用該工作空間。一般公開註冊不會產生測試資料。`INVITE_TESTING_MODE=true` 只供刻意關閉一般帳號進入後台的私有邀請環境使用；公開 Beta 應保持 `false`。

公開網站會收集學生姓名和 WhatsApp 號碼。正式對外收集資料前，請自行準備適合所在地及用途的私隱告知、資料保留和刪除安排。本專案目前未提供完整的帳號刪除與資料保留流程。

## 遇到問題

| 情況 | 先檢查甚麼 |
|---|---|
| `node` 或 `pnpm` 找不到 | 重新開啟終端機，檢查 Node 安裝和 `corepack enable` |
| `pnpm db:migrate` 無法連線 | `DIRECT_DATABASE_URL` 是否完整、密碼是否已代入、是否用了 port `5432` 的連線方式 |
| 網站顯示缺少環境變數 | `.env.local` 是否在 `package.json` 同一資料夾；修改後重新執行 `pnpm dev` |
| 註冊後無法進入後台 | 檢查 `PUBLIC_SIGNUP_ENABLED=true` 和 `INVITE_TESTING_MODE=false`，然後重啟或重新部署 |
| 收不到確認或重設電郵 | 檢查 Supabase 的 SMTP、垃圾郵件匣及 Auth URL Configuration |
| 學生收到錯誤網址 | `NEXT_PUBLIC_APP_URL` 是否等於正在使用的網站網址，更新後重新部署 |

回報問題時請附上你執行的步驟和**遮去密碼、連線字串及 key** 後的錯誤訊息。

## 功能與限制

- 老師可設定公開資料、服務、每週開放時間、指定日期休假，並管理查詢、課堂和學生名冊。
- 新帳號會建立預設的 60 分鐘私人課和開放時間；老師可自行修改。
- 新帳號的預約頁起初不會發佈。老師須先檢查示例課堂及開放時間，於「分享連結」頁預覽並確認後才發佈。
- 同一時段可以收到多個待確認查詢。確認其中一個後，其他重疊查詢會顯示衝突。
- 已確認課堂可以由學生或老師提出改期；在對方接受之前，原時段繼續保留。接受後同一筆課堂才改到新時間。雙方亦可取消未開始的已確認課堂；所有改期與取消仍須自行透過 WhatsApp 通知對方。
- 目前以一對一私人課為主；沒有內建付款、套票、小組班或等候名單。Google Calendar 只單向接收已確認課堂，其他日曆活動不會自動遮擋可約時間。
- 老師須填寫可接收 WhatsApp 的號碼才可發佈預約頁。學生提交查詢後，可一鍵開啟 WhatsApp，把查詢時段及狀態連結傳給老師；仍須親自按「傳送」。老師確認、拒絕或取消後亦須親自傳送 WhatsApp 訊息。系統不會自動發送訊息或電郵。
- 已確認課堂可選擇連接 Google Calendar，同步新增、改期及取消。需要網站管理員先設定 Google OAuth；老師在「更多 → Google Calendar」自行授權。日曆中其他活動目前不會反過來遮擋預約空檔。

### Google Calendar（可選）

網站管理員只需為整個約課易網站建立一組 Google OAuth 應用憑證，放在部署環境；**不是把某位老師的 Google 帳號放進 `.env`**。每位老師登入約課易後，到「更多 → Google Calendar」自行選擇並授權自己的 Google 帳號。程式把授權資料加密後按老師的 workspace 分開保存，之後只把該老師已確認的課堂同步到其所授權帳號的主要日曆。約課易註冊電郵與 Google 帳號可以不同。目前每個 workspace 只連接一個 Google 帳號。

網站管理員須在 [Google Cloud Console](https://console.cloud.google.com/) 啟用 Calendar API，建立 OAuth Web application，把網站的 `/api/google-calendar/callback` 設為授權重新導向網址，然後在網站部署環境填入 `.env.example` 所列的 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 和 `GOOGLE_TOKEN_ENCRYPTION_KEY`。正式公開的 OAuth 應用可能需要完成 Google 的授權畫面驗證；請參考 [Google 官方範圍及驗證說明](https://developers.google.com/workspace/calendar/api/auth)。老師連接後可按「同步未來課堂」補入現有已確認課堂；超過一批時按「繼續同步」。日曆事件只顯示課堂名稱，不包含學生姓名；點擊事件內的約課易連結可返回後台查看詳情。
若同步失敗，老師首頁會提示檢查；到 Google Calendar 設定頁重新同步全部批次，成功後提示才會消失。

## 開發者參考

技術棧：Next.js 16、React 19、TypeScript、Tailwind CSS、Supabase Postgres/Auth、Drizzle ORM。資料庫 migration 位於 `drizzle/`。只有修改資料庫 schema 時才需要 `pnpm db:generate`；一般安裝只執行 `pnpm db:migrate`。

其他環境變數及測試設定見 [`.env.example`](.env.example)。`RATE_LIMIT_IP_HEADER` 用於公開 endpoint 的 IP 限流；部署時應填寫平台覆寫、訪客不能自行控制的 client IP header 名稱。未設定時，production 所有訪客會共用同一個限流額度，可能令正常查詢被限制。不要未經核實就填入任意 header。
本機測試可留空；若網站直接部署在 Vercel，可在 Vercel 的 Environment Variables 設為 `x-vercel-forwarded-for`。若另有代理伺服器或使用其他平台，須按該平台的可信請求 header 設定。

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

整合測試另需 Docker；相關指令可在 `package.json` 查看。
