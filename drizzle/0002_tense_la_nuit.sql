CREATE TYPE "public"."service_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('OPEN', 'BOOKED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "slot_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_slots_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "availability_slots_end_after_start" CHECK ("availability_slots"."end_at" > "availability_slots"."start_at")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"service_type" "service_type" DEFAULT 'PRIVATE' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "service_status" DEFAULT 'ACTIVE' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "services_duration_range" CHECK ("services"."duration_minutes" between 15 and 240)
);
--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_instructor_workspace_fk" FOREIGN KEY ("instructor_id","workspace_id") REFERENCES "public"."instructor_profiles"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_service_workspace_fk" FOREIGN KEY ("service_id","workspace_id") REFERENCES "public"."services"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_instructor_workspace_fk" FOREIGN KEY ("instructor_id","workspace_id") REFERENCES "public"."instructor_profiles"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_slots_workspace_start_idx" ON "availability_slots" USING btree ("workspace_id","start_at");--> statement-breakpoint
CREATE INDEX "services_workspace_idx" ON "services" USING btree ("workspace_id");