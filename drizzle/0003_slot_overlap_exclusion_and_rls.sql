-- 同一位老師的可預約時段不可互相重疊（規格 §8.4）。
--
-- 用 exclusion constraint 而非應用層檢查，理由是它在併發下依然正確：
-- 兩個同時送出的建立請求，資料庫會擋下後到的那一個。
--
-- 半開區間 '[)' 精確對應規格 §11.8：一個時段在另一個結束的那一刻開始，不算重疊。
-- 例如 09:00–10:00 與 10:00–11:00 可以並存。
--
-- 只約束仍會佔用時間的狀態；已取消或已過期的時段不參與判定，
-- 老師因此可以在取消後重新開放同一段時間。
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "availability_slots"
  ADD CONSTRAINT "availability_slots_no_overlap"
  EXCLUDE USING gist (
    "instructor_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" IN ('OPEN', 'BOOKED'));--> statement-breakpoint

-- 與其他資料表一致：啟用 RLS 但不建立 policy，所有存取一律經 server。
-- 見 docs/DESIGN.md §2.2。
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "availability_slots" ENABLE ROW LEVEL SECURITY;
