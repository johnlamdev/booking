CREATE TYPE "public"."reschedule_initiator" AS ENUM('STUDENT', 'INSTRUCTOR');--> statement-breakpoint
CREATE TYPE "public"."reschedule_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "reschedule_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_inquiry_id" uuid NOT NULL,
	"proposed_start_at" timestamp with time zone NOT NULL,
	"proposed_end_at" timestamp with time zone NOT NULL,
	"initiated_by" "reschedule_initiator" NOT NULL,
	"status" "reschedule_status" DEFAULT 'PENDING' NOT NULL,
	"response_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reschedule_proposals_response_token_hash_unique" UNIQUE("response_token_hash"),
	CONSTRAINT "reschedule_proposals_end_after_start" CHECK ("reschedule_proposals"."proposed_end_at" > "reschedule_proposals"."proposed_start_at")
);
--> statement-breakpoint
ALTER TABLE "reschedule_proposals" ADD CONSTRAINT "reschedule_proposals_booking_inquiry_id_booking_inquiries_id_fk" FOREIGN KEY ("booking_inquiry_id") REFERENCES "public"."booking_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reschedule_one_pending_per_booking" ON "reschedule_proposals" USING btree ("booking_inquiry_id") WHERE "reschedule_proposals"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "reschedule_proposals_booking_idx" ON "reschedule_proposals" USING btree ("booking_inquiry_id","created_at");
--> statement-breakpoint
ALTER TABLE "reschedule_proposals" ENABLE ROW LEVEL SECURITY;
