ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_id_unique" UNIQUE("tracking_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");