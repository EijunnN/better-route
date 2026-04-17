import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";
import { vehicles } from "./vehicles";

// Vehicle skill categories
export const VEHICLE_SKILL_CATEGORIES = {
  EQUIPMENT: "EQUIPMENT",
  TEMPERATURE: "TEMPERATURE",
  CERTIFICATIONS: "CERTIFICATIONS",
  SPECIAL: "SPECIAL",
} as const;

export const vehicleSkills = pgTable("vehicle_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 })
    .notNull()
    .$type<keyof typeof VEHICLE_SKILL_CATEGORIES>(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("vehicle_skills_company_code_idx").on(table.companyId, table.code),
]);

// User Skills junction table (renamed from driver_skills)
export const userSkills = pgTable("user_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => vehicleSkills.id, { onDelete: "cascade" }),
  obtainedAt: timestamp("obtained_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Vehicle Skill Assignments - junction table for vehicle-skill relationship
export const vehicleSkillAssignments = pgTable("vehicle_skill_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => vehicleSkills.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("vehicle_skill_assignments_vehicle_skill_idx").on(table.vehicleId, table.skillId),
]);
