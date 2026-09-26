-- RLS deny-all：啟用 Row Level Security 但**刻意不建立任何 policy**。
--
-- 效果：使用 anon key 或 authenticated key 從瀏覽器直接查詢，一律讀不到任何業務資料。
-- 所有讀寫都必須經過 server-side 的 Drizzle 直連，授權在 server 檢查 active
-- workspace membership。見 docs/DESIGN.md §2.2。
--
-- 注意：Supabase 的 postgres 角色具備 BYPASSRLS，因此本專案的 server 連線不受影響。
-- 若日後改用不具 BYPASSRLS 的角色連線，必須為該角色補上對應 policy，否則查詢會全部回傳空集合。

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ENABLE ROW LEVEL SECURITY;
