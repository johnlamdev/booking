-- 與其他資料表一致：啟用 RLS 但不建立 policy，所有存取一律經 server。
-- 見 docs/DESIGN.md §2.2。
ALTER TABLE "availability_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ENABLE ROW LEVEL SECURITY;
