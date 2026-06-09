ALTER TABLE "route_stops" ADD COLUMN "predicted_eta_at" timestamp;--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "eta_computed_at" timestamp;