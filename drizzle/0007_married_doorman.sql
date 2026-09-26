CREATE TYPE "public"."actor_type" AS ENUM('STUDENT', 'USER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'REJECTED_CONFLICT', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "booking_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"student_name" text NOT NULL,
	"student_email" text,
	"student_phone" text,
	"student_note" text,
	"status" "inquiry_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"privacy_consent_at" timestamp with time zone NOT NULL,
	"status_token_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_inquiries_status_token_hash_unique" UNIQUE("status_token_hash"),
	CONSTRAINT "booking_inquiries_idempotency_key" UNIQUE("instructor_id","start_at","idempotency_key"),
	CONSTRAINT "booking_inquiries_end_after_start" CHECK ("booking_inquiries"."end_at" > "booking_inquiries"."start_at"),
	CONSTRAINT "booking_inquiries_contact_present" CHECK ("booking_inquiries"."student_email" is not null or "booking_inquiries"."student_phone" is not null),
	CONSTRAINT "booking_inquiries_note_length" CHECK ("booking_inquiries"."student_note" is null or length("booking_inquiries"."student_note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "inquiry_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_inquiry_id" uuid NOT NULL,
	"from_status" "inquiry_status",
	"to_status" "inquiry_status" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_instructor_workspace_fk" FOREIGN KEY ("instructor_id","workspace_id") REFERENCES "public"."instructor_profiles"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_service_workspace_fk" FOREIGN KEY ("service_id","workspace_id") REFERENCES "public"."services"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_status_events" ADD CONSTRAINT "inquiry_status_events_booking_inquiry_id_booking_inquiries_id_fk" FOREIGN KEY ("booking_inquiry_id") REFERENCES "public"."booking_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_status_events" ADD CONSTRAINT "inquiry_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_inquiries_inbox_idx" ON "booking_inquiries" USING btree ("workspace_id","status","submitted_at");--> statement-breakpoint
CREATE INDEX "booking_inquiries_time_idx" ON "booking_inquiries" USING btree ("instructor_id","start_at");--> statement-breakpoint
CREATE INDEX "inquiry_status_events_inquiry_idx" ON "inquiry_status_events" USING btree ("booking_inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_bucket_idx" ON "rate_limit_hits" USING btree ("bucket","created_at");