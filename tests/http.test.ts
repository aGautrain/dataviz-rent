import { describe, expect, it } from "vitest";
import { createPoliteFetch } from "@/sources/http";

function recorder(statuses: number[]) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    return new Response("body", { status: statuses.shift() ?? 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("polite fetch", () => {
  it("spaces out requests to the same host", async () => {
    const waits: number[] = [];
    const { fetchImpl } = recorder([]);
    const politeFetch = createPoliteFetch({
      fetchImpl,
      minIntervalMs: 1000,
      sleep: async (ms) => void waits.push(ms),
    });
    await politeFetch("https://a.example/1");
    await politeFetch("https://a.example/2");
    await politeFetch("https://b.example/1");
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(900);
  });

  it("retries 429 and 5xx with backoff, then gives up", async () => {
    const { calls, fetchImpl } = recorder([429, 503, 503, 503]);
    const politeFetch = createPoliteFetch({ fetchImpl, retries: 2, sleep: async () => {} });
    const response = await politeFetch("https://a.example/");
    expect(calls).toHaveLength(3);
    expect(response.status).toBe(503);
  });

  it("does not retry client errors and sends a browser-like user agent", async () => {
    const { calls, fetchImpl } = recorder([404]);
    const politeFetch = createPoliteFetch({ fetchImpl, sleep: async () => {} });
    expect((await politeFetch("https://a.example/")).status).toBe(404);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get("user-agent")).toMatch(/Mozilla/);
  });
});
