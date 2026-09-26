CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"normalized_email" text,
	"phone" text,
	"normalized_phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_id_workspace_key" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- 把既有查詢按電話優先、電郵其次整理成學生。只有姓名而沒有聯絡方式的課堂
-- 會各自建立學生，避免把兩位同名學生誤合併。
WITH normalized AS (
	SELECT
		bi.*,
		NULLIF(lower(trim(bi.student_email)), '') AS normalized_email,
		CASE
			WHEN NULLIF(regexp_replace(coalesce(bi.student_phone, ''), '[^0-9]', '', 'g'), '') IS NULL THEN NULL
			WHEN length(regexp_replace(bi.student_phone, '[^0-9]', '', 'g')) = 8
				THEN '852' || regexp_replace(bi.student_phone, '[^0-9]', '', 'g')
			WHEN regexp_replace(bi.student_phone, '[^0-9]', '', 'g') LIKE '00852%'
				THEN substring(regexp_replace(bi.student_phone, '[^0-9]', '', 'g') FROM 3)
			ELSE regexp_replace(bi.student_phone, '[^0-9]', '', 'g')
		END AS normalized_phone
	FROM booking_inquiries bi
), identified AS (
	SELECT *, coalesce('phone:' || normalized_phone, 'email:' || normalized_email) AS identity_key
	FROM normalized
	WHERE normalized_phone IS NOT NULL OR normalized_email IS NOT NULL
)
INSERT INTO students (
	workspace_id, display_name, email, normalized_email, phone, normalized_phone, created_at, updated_at
)
SELECT
	workspace_id,
	(array_agg(student_name ORDER BY submitted_at DESC))[1],
	(array_agg(student_email ORDER BY submitted_at DESC) FILTER (WHERE student_email IS NOT NULL))[1],
	(array_agg(normalized_email ORDER BY submitted_at DESC) FILTER (WHERE normalized_email IS NOT NULL))[1],
	(array_agg(student_phone ORDER BY submitted_at DESC) FILTER (WHERE student_phone IS NOT NULL))[1],
	(array_agg(normalized_phone ORDER BY submitted_at DESC) FILTER (WHERE normalized_phone IS NOT NULL))[1],
	min(created_at),
	max(updated_at)
FROM identified
GROUP BY workspace_id, identity_key;--> statement-breakpoint

WITH normalized AS (
	SELECT
		bi.id,
		bi.workspace_id,
		NULLIF(lower(trim(bi.student_email)), '') AS normalized_email,
		CASE
			WHEN NULLIF(regexp_replace(coalesce(bi.student_phone, ''), '[^0-9]', '', 'g'), '') IS NULL THEN NULL
			WHEN length(regexp_replace(bi.student_phone, '[^0-9]', '', 'g')) = 8
				THEN '852' || regexp_replace(bi.student_phone, '[^0-9]', '', 'g')
			WHEN regexp_replace(bi.student_phone, '[^0-9]', '', 'g') LIKE '00852%'
				THEN substring(regexp_replace(bi.student_phone, '[^0-9]', '', 'g') FROM 3)
			ELSE regexp_replace(bi.student_phone, '[^0-9]', '', 'g')
		END AS normalized_phone
	FROM booking_inquiries bi
)
UPDATE booking_inquiries bi
SET student_id = s.id
FROM normalized n
JOIN students s ON s.workspace_id = n.workspace_id
	AND (
		(n.normalized_phone IS NOT NULL AND s.normalized_phone = n.normalized_phone)
		OR (n.normalized_phone IS NULL AND n.normalized_email IS NOT NULL AND s.normalized_email = n.normalized_email)
	)
WHERE bi.id = n.id;--> statement-breakpoint

INSERT INTO students (id, workspace_id, display_name, created_at, updated_at)
SELECT
	(
		substring(md5('student:' || bi.id::text), 1, 8) || '-' ||
		substring(md5('student:' || bi.id::text), 9, 4) || '-' ||
		substring(md5('student:' || bi.id::text), 13, 4) || '-' ||
		substring(md5('student:' || bi.id::text), 17, 4) || '-' ||
		substring(md5('student:' || bi.id::text), 21, 12)
	)::uuid,
	bi.workspace_id,
	bi.student_name,
	bi.created_at,
	bi.updated_at
FROM booking_inquiries bi
WHERE bi.student_email IS NULL AND bi.student_phone IS NULL;--> statement-breakpoint

UPDATE booking_inquiries bi
SET student_id = (
		substring(md5('student:' || bi.id::text), 1, 8) || '-' ||
		substring(md5('student:' || bi.id::text), 9, 4) || '-' ||
		substring(md5('student:' || bi.id::text), 13, 4) || '-' ||
		substring(md5('student:' || bi.id::text), 17, 4) || '-' ||
		substring(md5('student:' || bi.id::text), 21, 12)
	)::uuid
WHERE bi.student_email IS NULL AND bi.student_phone IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "students_workspace_email_unique" ON "students" USING btree ("workspace_id","normalized_email") WHERE "students"."normalized_email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "students_workspace_phone_unique" ON "students" USING btree ("workspace_id","normalized_phone") WHERE "students"."normalized_phone" is not null;--> statement-breakpoint
CREATE INDEX "students_workspace_name_idx" ON "students" USING btree ("workspace_id","display_name");--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_student_workspace_fk" FOREIGN KEY ("student_id","workspace_id") REFERENCES "public"."students"("id","workspace_id") ON DELETE no action ON UPDATE no action;
