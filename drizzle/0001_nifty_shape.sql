CREATE TABLE "company_tracking_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tracking_enabled" boolean DEFAULT false NOT NULL,
	"show_map" boolean DEFAULT true NOT NULL,
	"show_driver_location" boolean DEFAULT true NOT NULL,
	"show_driver_name" boolean DEFAULT false NOT NULL,
	"show_driver_photo" boolean DEFAULT false NOT NULL,
	"show_evidence" boolean DEFAULT true NOT NULL,
	"show_eta" boolean DEFAULT true NOT NULL,
	"show_timeline" boolean DEFAULT true NOT NULL,
	"brand_color" varchar(20) DEFAULT '#3B82F6',
	"logo_url" varchar(500),
	"custom_message" varchar(500),
	"token_expiry_hours" integer DEFAULT 48,
	"auto_generate_tokens" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_tracking_settings_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "tracking_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"tracking_id" varchar(50) NOT NULL,
	"token" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "company_tracking_settings" ADD CONSTRAINT "company_tracking_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_tokens_token_idx" ON "tracking_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tracking_tokens_company_tracking_id_idx" ON "tracking_tokens" USING btree ("company_id","tracking_id");