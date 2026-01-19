CREATE TABLE "company_optimization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"enable_order_value" boolean DEFAULT false NOT NULL,
	"enable_order_type" boolean DEFAULT false NOT NULL,
	"enable_weight" boolean DEFAULT true NOT NULL,
	"enable_volume" boolean DEFAULT true NOT NULL,
	"enable_units" boolean DEFAULT false NOT NULL,
	"active_dimensions" text DEFAULT '["WEIGHT","VOLUME"]' NOT NULL,
	"priority_mapping" text DEFAULT '{"NEW":50,"RESCHEDULED":80,"URGENT":100}' NOT NULL,
	"default_time_windows" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_optimization_profiles_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_value" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "units_required" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "time_window_start" time;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "time_window_end" time;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "max_value_capacity" integer;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "max_units_capacity" integer;--> statement-breakpoint
ALTER TABLE "company_optimization_profiles" ADD CONSTRAINT "company_optimization_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;