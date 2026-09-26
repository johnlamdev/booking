ALTER TABLE "workspaces" ADD COLUMN "is_experience" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "experience_version" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "experience_started_at" timestamp with time zone;--> statement-breakpoint
UPDATE "workspaces"
SET "is_experience" = true,
    "experience_version" = 'tester-v1',
    "experience_started_at" = "created_at";
