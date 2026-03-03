CREATE INDEX "alerts_company_id_idx" ON "alerts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "alerts_company_status_idx" ON "alerts" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "alerts_entity_idx" ON "alerts" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "fleets_company_id_idx" ON "fleets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "optimization_jobs_company_id_idx" ON "optimization_jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "optimization_jobs_company_status_idx" ON "optimization_jobs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "optimization_jobs_config_idx" ON "optimization_jobs" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "users_company_id_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "users_company_role_idx" ON "users" USING btree ("company_id","role");--> statement-breakpoint
CREATE INDEX "vehicle_fleets_fleet_id_idx" ON "vehicle_fleets" USING btree ("fleet_id");--> statement-breakpoint
CREATE INDEX "vehicles_company_id_idx" ON "vehicles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "vehicles_company_status_idx" ON "vehicles" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "vehicles_assigned_driver_idx" ON "vehicles" USING btree ("assigned_driver_id");--> statement-breakpoint
CREATE INDEX "zone_vehicles_vehicle_id_idx" ON "zone_vehicles" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "zone_vehicles_zone_id_idx" ON "zone_vehicles" USING btree ("zone_id");