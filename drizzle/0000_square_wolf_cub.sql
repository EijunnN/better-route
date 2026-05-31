CREATE TABLE "alert_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"severity" varchar(20) DEFAULT 'WARNING' NOT NULL,
	"threshold" integer,
	"metadata" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rule_id" uuid,
	"severity" varchar(20) NOT NULL,
	"type" varchar(50) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"last_message_at" timestamp,
	"last_message_preview" text,
	"unread_for_dispatch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"direction" varchar(12) NOT NULL,
	"kind" varchar(12) DEFAULT 'TEXT' NOT NULL,
	"body" text NOT NULL,
	"template_code" varchar(40),
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"commercial_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"tax_address" text,
	"country" varchar(2) NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"date_format" varchar(20) DEFAULT 'DD/MM/YYYY' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_legal_name_unique" UNIQUE("legal_name")
);
--> statement-breakpoint
CREATE TABLE "company_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity" varchar(20) DEFAULT 'orders' NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"field_type" varchar(20) DEFAULT 'text' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"placeholder" varchar(255),
	"options" jsonb,
	"default_value" text,
	"position" integer DEFAULT 0 NOT NULL,
	"show_in_list" boolean DEFAULT false NOT NULL,
	"show_in_mobile" boolean DEFAULT true NOT NULL,
	"show_in_csv" boolean DEFAULT true NOT NULL,
	"validation_rules" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_secondary_fleets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fleet_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_fleet_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"previous_fleet_id" uuid,
	"new_fleet_id" uuid,
	"user_id" uuid,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_fleets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"fleet_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_optimization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"enable_order_value" boolean DEFAULT false NOT NULL,
	"enable_order_type" boolean DEFAULT false NOT NULL,
	"enable_weight" boolean DEFAULT true NOT NULL,
	"enable_volume" boolean DEFAULT true NOT NULL,
	"enable_units" boolean DEFAULT false NOT NULL,
	"active_dimensions" jsonb DEFAULT '["WEIGHT","VOLUME"]'::jsonb NOT NULL,
	"priority_mapping" jsonb DEFAULT '{"NEW":50,"RESCHEDULED":80,"URGENT":100}'::jsonb NOT NULL,
	"default_time_windows" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_optimization_profiles_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "optimization_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"depot_latitude" varchar(20) NOT NULL,
	"depot_longitude" varchar(20) NOT NULL,
	"depot_address" text,
	"selected_vehicle_ids" jsonb NOT NULL,
	"selected_driver_ids" jsonb NOT NULL,
	"objective" varchar(20) DEFAULT 'BALANCED' NOT NULL,
	"work_window_start" time NOT NULL,
	"work_window_end" time NOT NULL,
	"service_time_minutes" integer DEFAULT 10 NOT NULL,
	"time_window_strictness" varchar(20) DEFAULT 'SOFT' NOT NULL,
	"penalty_factor" integer DEFAULT 3 NOT NULL,
	"max_routes" integer,
	"optimizer_type" varchar(20) DEFAULT 'VROOM' NOT NULL,
	"optimization_preset_id" uuid,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"timeout_ms" integer DEFAULT 300000 NOT NULL,
	"input_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"balance_visits" boolean DEFAULT false NOT NULL,
	"minimize_vehicles" boolean DEFAULT false NOT NULL,
	"open_start" boolean DEFAULT false NOT NULL,
	"one_route_per_vehicle" boolean DEFAULT true NOT NULL,
	"flexible_time_windows" boolean DEFAULT false NOT NULL,
	"group_same_location" boolean DEFAULT true NOT NULL,
	"max_distance_km" integer DEFAULT 200,
	"traffic_factor" integer DEFAULT 50,
	"route_end_mode" varchar(50) DEFAULT 'DRIVER_ORIGIN' NOT NULL,
	"end_depot_latitude" varchar(50),
	"end_depot_longitude" varchar(50),
	"end_depot_address" varchar(500),
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"total_routes" integer NOT NULL,
	"total_stops" integer NOT NULL,
	"total_distance" integer NOT NULL,
	"total_duration" integer NOT NULL,
	"average_utilization_rate" integer NOT NULL,
	"max_utilization_rate" integer NOT NULL,
	"min_utilization_rate" integer NOT NULL,
	"time_window_compliance_rate" integer NOT NULL,
	"total_time_window_violations" integer NOT NULL,
	"driver_assignment_coverage" integer NOT NULL,
	"average_assignment_quality" integer NOT NULL,
	"assignments_with_warnings" integer NOT NULL,
	"assignments_with_errors" integer NOT NULL,
	"skill_coverage" integer NOT NULL,
	"license_compliance" integer NOT NULL,
	"fleet_alignment" integer NOT NULL,
	"workload_balance" integer NOT NULL,
	"unassigned_orders" integer NOT NULL,
	"objective" varchar(20),
	"processing_time_ms" integer NOT NULL,
	"compared_to_job_id" uuid,
	"distance_change_percent" integer,
	"duration_change_percent" integer,
	"compliance_change_percent" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_column_mapping_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"column_mapping" jsonb NOT NULL,
	"required_fields" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tracking_id" varchar(50) NOT NULL,
	"customer_name" varchar(255),
	"customer_phone" varchar(50),
	"customer_email" varchar(255),
	"address" text NOT NULL,
	"latitude" varchar(20) NOT NULL,
	"longitude" varchar(20) NOT NULL,
	"time_window_preset_id" uuid,
	"strictness" varchar(20),
	"promised_date" timestamp,
	"weight_required" integer,
	"volume_required" integer,
	"order_value" integer,
	"units_required" integer,
	"order_type" varchar(20),
	"priority" integer DEFAULT 50,
	"time_window_start" time,
	"time_window_end" time,
	"required_skills" text,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"cancellation_reason_category" varchar(30),
	"cancellation_reason_note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_window_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"start_time" time,
	"end_time" time,
	"exact_time" time,
	"tolerance_minutes" integer,
	"strictness" varchar(20) DEFAULT 'HARD' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"code" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "output_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"generated_by" uuid NOT NULL,
	"format" varchar(10) DEFAULT 'JSON' NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"file_url" text,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reassignments_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid,
	"absent_user_id" uuid NOT NULL,
	"absent_user_name" varchar(255) NOT NULL,
	"route_ids" jsonb NOT NULL,
	"vehicle_ids" jsonb NOT NULL,
	"reassignments" jsonb NOT NULL,
	"reason" text,
	"executed_by" uuid,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_stop_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"route_stop_id" uuid NOT NULL,
	"previous_status" varchar(20),
	"new_status" varchar(20) NOT NULL,
	"user_id" uuid,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"route_id" varchar(100) NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"address" text NOT NULL,
	"latitude" varchar(20) NOT NULL,
	"longitude" varchar(20) NOT NULL,
	"estimated_arrival" timestamp,
	"estimated_service_time" integer,
	"time_window_start" timestamp,
	"time_window_end" timestamp,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"failure_reason" varchar(80),
	"evidence_urls" jsonb,
	"zone_id" uuid,
	"metadata" jsonb,
	"custom_fields" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"obtained_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_skill_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"changes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day_of_week" varchar(10) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_day_off" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_driver_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"previous_status" varchar(50),
	"new_status" varchar(50) NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"context" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"phone" varchar(50),
	"identification" varchar(50),
	"birth_date" timestamp,
	"photo" text,
	"license_number" varchar(100),
	"license_expiry" timestamp,
	"license_categories" varchar(255),
	"certifications" text,
	"driver_status" varchar(50),
	"primary_fleet_id" uuid,
	"app_online" boolean,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vehicle_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"previous_status" varchar(50),
	"new_status" varchar(50) NOT NULL,
	"user_id" uuid,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"use_name_as_plate" boolean DEFAULT false NOT NULL,
	"plate" varchar(50),
	"brand" varchar(100),
	"model" varchar(100),
	"max_orders" integer DEFAULT 20 NOT NULL,
	"weight_capacity" integer,
	"volume_capacity" integer,
	"max_value_capacity" integer,
	"max_units_capacity" integer,
	"origin_address" text,
	"origin_latitude" varchar(20),
	"origin_longitude" varchar(20),
	"assigned_driver_id" uuid,
	"license_required" varchar(10),
	"workday_start" time,
	"workday_end" time,
	"has_break_time" boolean DEFAULT false NOT NULL,
	"break_duration" integer,
	"break_time_start" time,
	"break_time_end" time,
	"insurance_expiry" timestamp,
	"inspection_expiry" timestamp,
	"status" varchar(50) DEFAULT 'AVAILABLE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"failure_reason" varchar(80),
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
CREATE TABLE "company_delivery_policy" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"label_pending" varchar(100) DEFAULT 'Pendiente' NOT NULL,
	"label_in_progress" varchar(100) DEFAULT 'En progreso' NOT NULL,
	"label_completed" varchar(100) DEFAULT 'Entregado' NOT NULL,
	"label_failed" varchar(100) DEFAULT 'No entregado' NOT NULL,
	"color_pending" varchar(7) DEFAULT '#6B7280' NOT NULL,
	"color_in_progress" varchar(7) DEFAULT '#3B82F6' NOT NULL,
	"color_completed" varchar(7) DEFAULT '#16A34A' NOT NULL,
	"color_failed" varchar(7) DEFAULT '#DC4840' NOT NULL,
	"completed_requires_photo" boolean DEFAULT true NOT NULL,
	"completed_requires_signature" boolean DEFAULT false NOT NULL,
	"completed_requires_notes" boolean DEFAULT false NOT NULL,
	"failed_requires_photo" boolean DEFAULT false NOT NULL,
	"failed_requires_notes" boolean DEFAULT true NOT NULL,
	"failure_reasons" jsonb DEFAULT '["Cliente ausente","Dirección incorrecta","Paquete dañado","Cliente rechazó","Zona insegura","Reprogramado","Otro"]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"assigned_days" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50) DEFAULT 'DELIVERY',
	"geometry" jsonb NOT NULL,
	"color" varchar(20) DEFAULT '#3B82F6',
	"is_default" boolean DEFAULT false NOT NULL,
	"active_days" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_notifications" ADD CONSTRAINT "alert_notifications_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_notifications" ADD CONSTRAINT "alert_notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_field_definitions" ADD CONSTRAINT "company_field_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_secondary_fleets" ADD CONSTRAINT "user_secondary_fleets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_secondary_fleets" ADD CONSTRAINT "user_secondary_fleets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_secondary_fleets" ADD CONSTRAINT "user_secondary_fleets_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleet_history" ADD CONSTRAINT "vehicle_fleet_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleet_history" ADD CONSTRAINT "vehicle_fleet_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleet_history" ADD CONSTRAINT "vehicle_fleet_history_previous_fleet_id_fleets_id_fk" FOREIGN KEY ("previous_fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleet_history" ADD CONSTRAINT "vehicle_fleet_history_new_fleet_id_fleets_id_fk" FOREIGN KEY ("new_fleet_id") REFERENCES "public"."fleets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleet_history" ADD CONSTRAINT "vehicle_fleet_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleets" ADD CONSTRAINT "vehicle_fleets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleets" ADD CONSTRAINT "vehicle_fleets_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_fleets" ADD CONSTRAINT "vehicle_fleets_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_optimization_profiles" ADD CONSTRAINT "company_optimization_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_configurations" ADD CONSTRAINT "optimization_configurations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_configurations" ADD CONSTRAINT "optimization_configurations_optimization_preset_id_optimization_presets_id_fk" FOREIGN KEY ("optimization_preset_id") REFERENCES "public"."optimization_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_configurations" ADD CONSTRAINT "optimization_configurations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_jobs" ADD CONSTRAINT "optimization_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_jobs" ADD CONSTRAINT "optimization_jobs_configuration_id_optimization_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."optimization_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_presets" ADD CONSTRAINT "optimization_presets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_metrics" ADD CONSTRAINT "plan_metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_metrics" ADD CONSTRAINT "plan_metrics_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_metrics" ADD CONSTRAINT "plan_metrics_configuration_id_optimization_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."optimization_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_metrics" ADD CONSTRAINT "plan_metrics_compared_to_job_id_optimization_jobs_id_fk" FOREIGN KEY ("compared_to_job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_column_mapping_templates" ADD CONSTRAINT "csv_column_mapping_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_time_window_preset_id_time_window_presets_id_fk" FOREIGN KEY ("time_window_preset_id") REFERENCES "public"."time_window_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_window_presets" ADD CONSTRAINT "time_window_presets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_history" ADD CONSTRAINT "output_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_history" ADD CONSTRAINT "output_history_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_history" ADD CONSTRAINT "output_history_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments_history" ADD CONSTRAINT "reassignments_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments_history" ADD CONSTRAINT "reassignments_history_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments_history" ADD CONSTRAINT "reassignments_history_absent_user_id_users_id_fk" FOREIGN KEY ("absent_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments_history" ADD CONSTRAINT "reassignments_history_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop_history" ADD CONSTRAINT "route_stop_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop_history" ADD CONSTRAINT "route_stop_history_route_stop_id_route_stops_id_fk" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop_history" ADD CONSTRAINT "route_stop_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_vehicle_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."vehicle_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_skill_assignments" ADD CONSTRAINT "vehicle_skill_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_skill_assignments" ADD CONSTRAINT "vehicle_skill_assignments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_skill_assignments" ADD CONSTRAINT "vehicle_skill_assignments_skill_id_vehicle_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."vehicle_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_skills" ADD CONSTRAINT "vehicle_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tracking_settings" ADD CONSTRAINT "company_tracking_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_driver_status_history" ADD CONSTRAINT "user_driver_status_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_driver_status_history" ADD CONSTRAINT "user_driver_status_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_driver_status_history" ADD CONSTRAINT "user_driver_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_fleet_id_fleets_id_fk" FOREIGN KEY ("primary_fleet_id") REFERENCES "public"."fleets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_status_history" ADD CONSTRAINT "vehicle_status_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_status_history" ADD CONSTRAINT "vehicle_status_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_status_history" ADD CONSTRAINT "vehicle_status_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assigned_driver_id_users_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_route_stop_id_route_stops_id_fk" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_visits" ADD CONSTRAINT "delivery_visits_plan_id_optimization_jobs_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_delivery_policy" ADD CONSTRAINT "company_delivery_policy_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_vehicles" ADD CONSTRAINT "zone_vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_vehicles" ADD CONSTRAINT "zone_vehicles_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_vehicles" ADD CONSTRAINT "zone_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_company_id_idx" ON "alerts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "alerts_company_status_idx" ON "alerts" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "alerts_entity_idx" ON "alerts" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conv_company_driver_uq" ON "chat_conversations" USING btree ("company_id","driver_id");--> statement-breakpoint
CREATE INDEX "chat_conv_inbox_idx" ON "chat_conversations" USING btree ("company_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_msg_thread_idx" ON "chat_messages" USING btree ("company_id","driver_id","created_at");--> statement-breakpoint
CREATE INDEX "field_definitions_company_id_idx" ON "company_field_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_definitions_company_entity_code_active_uniq" ON "company_field_definitions" USING btree ("company_id","entity","code") WHERE "company_field_definitions"."active" = true;--> statement-breakpoint
CREATE INDEX "fleets_company_id_idx" ON "fleets" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_secondary_fleets_user_fleet_idx" ON "user_secondary_fleets" USING btree ("user_id","fleet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_fleets_vehicle_fleet_idx" ON "vehicle_fleets" USING btree ("vehicle_id","fleet_id");--> statement-breakpoint
CREATE INDEX "vehicle_fleets_fleet_id_idx" ON "vehicle_fleets" USING btree ("fleet_id");--> statement-breakpoint
CREATE INDEX "optimization_jobs_company_id_idx" ON "optimization_jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "optimization_jobs_company_status_idx" ON "optimization_jobs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "optimization_jobs_config_idx" ON "optimization_jobs" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "orders_company_id_idx" ON "orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_company_status_idx" ON "orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tracking_id_active_unique" ON "orders" USING btree ("tracking_id") WHERE "orders"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_idx" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_idx" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "route_stops_company_id_idx" ON "route_stops" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "route_stops_job_id_idx" ON "route_stops" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "route_stops_user_id_idx" ON "route_stops" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "route_stops_order_id_idx" ON "route_stops" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "route_stops_status_idx" ON "route_stops" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_skill_assignments_vehicle_skill_idx" ON "vehicle_skill_assignments" USING btree ("vehicle_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_skills_company_code_idx" ON "vehicle_skills" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "driver_locations_company_id_idx" ON "driver_locations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "driver_locations_driver_recorded_at_idx" ON "driver_locations" USING btree ("driver_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "driver_locations_recorded_at_idx" ON "driver_locations" USING btree ("recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_tokens_token_idx" ON "tracking_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tracking_tokens_company_tracking_id_idx" ON "tracking_tokens" USING btree ("company_id","tracking_id");--> statement-breakpoint
CREATE INDEX "users_company_id_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "users_company_role_idx" ON "users" USING btree ("company_id","role");--> statement-breakpoint
CREATE INDEX "vehicles_company_id_idx" ON "vehicles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "vehicles_company_status_idx" ON "vehicles" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "vehicles_assigned_driver_idx" ON "vehicles" USING btree ("assigned_driver_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_company_id_idx" ON "delivery_visits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_order_id_idx" ON "delivery_visits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_route_stop_id_idx" ON "delivery_visits" USING btree ("route_stop_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_driver_id_idx" ON "delivery_visits" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "delivery_visits_attempted_at_idx" ON "delivery_visits" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "zone_vehicles_vehicle_id_idx" ON "zone_vehicles" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "zone_vehicles_zone_id_idx" ON "zone_vehicles" USING btree ("zone_id");