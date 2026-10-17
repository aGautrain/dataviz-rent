import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Database };

export function getDb(): Database {
  if (globalForDb.db) return globalForDb.db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle(postgres(url, { max: 10 }), { schema });
  globalForDb.db = db;
  return db;
}
