CREATE TYPE "public"."booking_source" AS ENUM('STUDENT', 'INSTRUCTOR');--> statement-breakpoint
ALTER TABLE "booking_inquiries" DROP CONSTRAINT "booking_inquiries_contact_present";--> statement-breakpoint
ALTER TABLE "booking_inquiries" ALTER COLUMN "privacy_consent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "slot_interval_minutes" SET DEFAULT 60;--> statement-breakpoint
UPDATE "workspaces" SET "slot_interval_minutes" = 60;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD COLUMN "source" "booking_source" DEFAULT 'STUDENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_contact_present" CHECK ("booking_inquiries"."source" = 'INSTRUCTOR' or "booking_inquiries"."student_email" is not null or "booking_inquiries"."student_phone" is not null);
