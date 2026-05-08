CREATE TABLE "delivery_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"route_stop_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"plan_id" uuid,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"failure_reason" varchar(50),
	"notes" text,
	"evidence_urls" jsonb,
	"intended_address" text NOT NULL,
	"intended_latitude" varchar(20) NOT NULL,
	"intended_longitude" varchar(20) NOT NULL,
	"gps_latitude" varchar(20),
	"gps_longitude" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason_category" varchar(30);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason_note" text;--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_route_stop_id_route_stops_id_fk" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_plan_id_optimization_jobs_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_visits_company_id_idx" ON "delivery_visits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_order_id_idx" ON "delivery_visits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_route_stop_id_idx" ON "delivery_visits" USING btree ("route_stop_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_driver_id_idx" ON "delivery_visits" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_attempted_at_idx" ON "delivery_visits" USING btree ("attempted_at");