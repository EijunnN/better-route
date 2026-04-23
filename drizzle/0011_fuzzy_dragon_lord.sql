DROP TABLE "user_fleet_permissions" CASCADE;--> statement-breakpoint
ALTER TABLE "fleets" DROP COLUMN "weight_capacity";--> statement-breakpoint
ALTER TABLE "fleets" DROP COLUMN "volume_capacity";--> statement-breakpoint
ALTER TABLE "fleets" DROP COLUMN "operation_start";--> statement-breakpoint
ALTER TABLE "fleets" DROP COLUMN "operation_end";