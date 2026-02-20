import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(
  process.env.DATABASE_URL || "postgresql://localhost:5432/planeamiento",
  {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  },
);

export const db = drizzle(client, { schema });
