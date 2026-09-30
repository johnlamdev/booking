# 約課易 Beta 驗收狀態（2026-10-01）

這份紀錄區分已完成的程式檢查與尚未完成的實機驗收。未完成項目不應當成已通過。

以下新版功能仍在本機 Git 工作目錄，尚未部署到公開網站；現有網站運行的是較早版本。要在手機測新版，須先完成公開網站的部署及設定。

| 要求 | 程式與測試證據 | 實機驗收 |
|---|---|---|
| 學生查看空檔並提交查詢 | `getAvailableSlots` 只扣除 `CONFIRMED` 課堂；提交 action 重新驗證時段、服務及已發佈 workspace | 待兩部手機測試 |
| 老師確認查詢 | `confirmInquiry` 以 workspace 限定、鎖及資料庫 exclusion constraint 防止重疊確認；整合測試已編寫 | 待測試資料庫執行整合測試 |
| 雙方改期與撤回 | 提案保留原時段；對方接受後更新同一筆課堂；撤回後可再提出。整合測試已編寫 | 待測試資料庫及雙手機測試 |
| 雙方取消 | 已確認且未開始的課堂可取消；取消後原時段重新開放；整合測試已編寫 | 待測試資料庫及雙手機測試 |
| WhatsApp 交接 | 查詢、確認、改期、取消均有預填訊息入口；必須由使用者在 WhatsApp 親自按傳送 | 待兩部手機測試 |
| Google Calendar | OAuth、加密儲存授權、固定事件 ID、確認／改期／取消同步及手動補同步已實作；HTTP helper 單元測試通過 | 本機已完成真實 Google 授權及新增事件測試；改期、取消與公開網站仍待驗收 |
| 資料隔離 | 後台查詢及操作以 workspace 限定；新資料表啟用 deny-all RLS；現有整合測試涵蓋跨 workspace 操作 | 待測試資料庫執行整合測試 |
| 待確認不佔位 | 資料庫 exclusion constraint 僅限 `CONFIRMED`；現有整合測試涵蓋同一時段多筆待確認 | 待測試資料庫執行整合測試 |

本次靜態驗證：`tsc --noEmit`、ESLint、68 項單元測試、`drizzle-kit check` 及 Next.js `--webpack` 正式建置均通過。這些檢查不能替代公開網站與兩部手機的實測。

## 尚待網站管理員完成

1. 部署可由老師及學生手機開啟的 HTTPS 網站；設定 Supabase、`NEXT_PUBLIC_APP_URL`、Authentication redirect URL 和自訂 SMTP。
2. 確認部署使用的資料庫已有 `0016`、`0017` migration；用獨立測試 Postgres 執行 `pnpm test:integration`，切勿指向線上資料庫。
3. 設定正式網址的 Google OAuth 回調與部署環境中的 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_TOKEN_ENCRYPTION_KEY`；公開給名單外老師前，完成 Google OAuth 應用發布所需設定。
4. 設定部署平台可信的 `RATE_LIMIT_IP_HEADER`，然後按[雙手機試用檢測清單](BETA_TEST_CHECKLIST.md)逐步驗收。

目前 Google Calendar 為約課易到老師日曆的單向同步；Google 原有活動不會遮擋約課易空檔。中斷連接後，Google 既有事件須自行清理。
