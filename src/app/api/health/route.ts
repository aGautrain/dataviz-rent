import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";

export async function GET() {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
