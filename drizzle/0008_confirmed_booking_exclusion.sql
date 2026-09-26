-- 同一位老師的「已確認」預約不可互相重疊。
--
-- 這是整個 MVP 正確性的核心約束。用 exclusion constraint 而非應用層檢查，
-- 因為只有它在併發下成立：兩個同時送出的確認請求，資料庫會擋下後到的那一個。
--
-- 只約束 CONFIRMED：待確認（PENDING）不佔用老師的時間（規格 §11.1），
-- 因此同一時段可以同時有多筆待確認查詢，由老師選擇接受哪一筆。
--
-- 半開區間 '[)' 對應規格 §11.8：10:00–11:00 與 11:00–12:00 不算重疊。
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "booking_inquiries"
  ADD CONSTRAINT "booking_inquiries_no_confirmed_overlap"
  EXCLUDE USING gist (
    "instructor_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');--> statement-breakpoint

-- 與其他資料表一致：啟用 RLS 但不建立 policy，所有存取一律經 server。
-- 學生資料尤其不可從 browser 直接讀取。
ALTER TABLE "booking_inquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inquiry_status_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
