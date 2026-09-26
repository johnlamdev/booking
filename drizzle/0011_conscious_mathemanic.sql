ALTER TYPE "public"."inquiry_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD COLUMN "cancelled_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_inquiries" ADD CONSTRAINT "booking_inquiries_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;