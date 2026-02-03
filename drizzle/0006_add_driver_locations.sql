CREATE TABLE "driver_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"job_id" uuid,
	"route_id" varchar(100),
	"stop_sequence" integer,
	"latitude" varchar(20) NOT NULL,
	"longitude" varchar(20) NOT NULL,
	"accuracy" integer,
	"altitude" integer,
	"speed" integer,
	"heading" integer,
	"source" varchar(20) DEFAULT 'GPS' NOT NULL,
	"battery_level" integer,
	"is_moving" boolean DEFAULT true,
	"recorded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE set null ON UPDATE no action;