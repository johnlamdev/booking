DROP TABLE "availability_slots" CASCADE;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "slot_interval_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "min_notice_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "booking_horizon_days" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
DROP TYPE "public"."slot_status";