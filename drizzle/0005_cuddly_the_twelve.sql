CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_closed" boolean DEFAULT true NOT NULL,
	"start_time" time,
	"end_time" time,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_instructor_date_key" UNIQUE("instructor_id","date"),
	CONSTRAINT "availability_exceptions_times_valid" CHECK (("availability_exceptions"."is_closed" and "availability_exceptions"."start_time" is null and "availability_exceptions"."end_time" is null)
          or (not "availability_exceptions"."is_closed" and "availability_exceptions"."start_time" is not null and "availability_exceptions"."end_time" is not null and "availability_exceptions"."end_time" > "availability_exceptions"."start_time"))
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_weekday_range" CHECK ("availability_rules"."weekday" between 0 and 6),
	CONSTRAINT "availability_rules_end_after_start" CHECK ("availability_rules"."end_time" > "availability_rules"."start_time")
);
--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_instructor_workspace_fk" FOREIGN KEY ("instructor_id","workspace_id") REFERENCES "public"."instructor_profiles"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_instructor_workspace_fk" FOREIGN KEY ("instructor_id","workspace_id") REFERENCES "public"."instructor_profiles"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_exceptions_lookup_idx" ON "availability_exceptions" USING btree ("instructor_id","date");--> statement-breakpoint
CREATE INDEX "availability_rules_instructor_idx" ON "availability_rules" USING btree ("instructor_id","weekday");