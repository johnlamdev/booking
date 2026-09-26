-- 修正 0009 的 reconciliation event 選取方式。
--
-- 舊版以 `updated_at >= now() - interval '1 second'` 猜測「本次更新的列」，
-- 排程在一秒內重跑時可能為同一 inquiry 重複建立 EXPIRED event。
-- 新版直接使用 UPDATE ... RETURNING 的結果，事件與狀態更新在同一個 statement。
CREATE OR REPLACE FUNCTION reconcile_expired_inquiries()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  WITH expired AS (
    UPDATE booking_inquiries
       SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'PENDING'
       AND start_at < now()
    RETURNING id
  ), inserted_events AS (
    INSERT INTO inquiry_status_events (booking_inquiry_id, from_status, to_status, actor_type)
    SELECT id, 'PENDING', 'EXPIRED', 'SYSTEM'
      FROM expired
    RETURNING 1
  )
  SELECT count(*)::integer
    INTO affected
    FROM expired;

  DELETE FROM rate_limit_hits WHERE created_at < now() - interval '1 day';

  RETURN affected;
END;
$$;
