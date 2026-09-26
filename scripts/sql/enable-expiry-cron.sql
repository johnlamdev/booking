-- 啟用 booking_inquiries 過期收斂的排程。
--
-- 這份 SQL 刻意不放進 drizzle/ migration：整合測試會對本機 Docker Postgres
-- 跑一次完整 migration（見 tests/global-setup.ts），而該環境沒有 pg_cron，
-- 放進 migration 會令 `pnpm test:integration` 失敗。
--
-- 因此這是 Supabase 專屬的一次性設定，於 SQL Editor 執行。
-- 排程本身不影響正確性：過期狀態在顯示層本來就由時間推導
-- （見 drizzle/0009_expiry_reconciliation.sql 的說明），
-- 排程只負責把資料實體化，並清理逾一日的 rate_limit_hits。

-- 1. 啟用擴充功能（亦可在 Dashboard → Database → Extensions 開啟）。
create extension if not exists pg_cron with schema cron;

-- 2. 每 15 分鐘收斂一次。同名 job 重複執行會覆寫，不會產生第二個排程。
select cron.schedule(
  'reconcile-expired-inquiries',
  '*/15 * * * *',
  $$select reconcile_expired_inquiries()$$
);

-- 3. 確認排程已登記。
-- select jobid, jobname, schedule, active from cron.job;

-- 4. 執行幾次之後確認結果（status 應為 succeeded）。
-- select jobname, status, return_message, start_time
--   from cron.job_run_details
--  order by start_time desc
--  limit 10;

-- 停用方法：
-- select cron.unschedule('reconcile-expired-inquiries');
