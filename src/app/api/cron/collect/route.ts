import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { collectAll } from "@/sources/collect";
import { createPoliteFetch } from "@/sources/http";
import { ADAPTERS } from "@/sources/registry";
import { COLLECTION_TARGETS } from "@/sources/targets";

// A full run visits every site page by page, slowly on purpose.
export const maxDuration = 3600;

let running = false;

function isAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Triggered by the scheduler container (see docker-compose.yml) with
 * `Authorization: Bearer $CRON_SECRET`. Kept out of the beta login by proxy.ts.
 */
export async function POST(request: Request) {
  await connection();
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (running) return Response.json({ error: "a collection is already running" }, { status: 409 });

  running = true;
  try {
    const results = await collectAll(getDb(), ADAPTERS, COLLECTION_TARGETS, {
      fetch: createPoliteFetch(),
      log: (message) => console.log(`[collect] ${message}`),
    });
    return Response.json({ results });
  } finally {
    running = false;
  }
}
