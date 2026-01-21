ALTER TABLE "route_stops" ADD COLUMN "failure_reason" varchar(50);--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "evidence_urls" jsonb;