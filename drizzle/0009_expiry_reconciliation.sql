-- 把已過開始時間但仍待確認的查詢收斂為 EXPIRED。
--
-- **顯示層本來就由時間推導**（見 src/server/inquiries/queries.ts），
-- 所以這個 function 不執行也不影響正確性或安全性，只影響資料整潔度
-- 與收件匣的篩選結果。見 docs/DESIGN.md §3.5。
--
-- 冪等：只更新仍為 PENDING 的列，重複執行不會產生額外效果。
CREATE OR REPLACE FUNCTION reconcile_expired_inquiries()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE booking_inquiries
     SET status = 'EXPIRED', updated_at = now()
   WHERE status = 'PENDING'
     AND start_at < now();

  GET DIAGNOSTICS affected = ROW_COUNT;

  INSERT INTO inquiry_status_events (booking_inquiry_id, from_status, to_status, actor_type)
  SELECT id, 'PENDING', 'EXPIRED', 'SYSTEM'
    FROM booking_inquiries
   WHERE status = 'EXPIRED'
     AND updated_at >= now() - interval '1 second';

  DELETE FROM rate_limit_hits WHERE created_at < now() - interval '1 day';

  RETURN affected;
END;
$$;
