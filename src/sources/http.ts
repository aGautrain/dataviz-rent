import type { SourceContext } from "./types";

export interface PoliteFetchOptions {
  /** Minimum delay between two requests to the same host. */
  minIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A fetch that collects slowly: one request at a time per host, spaced out,
 * retried with backoff on 429 and 5xx. Sites are visited a few times a day at
 * most, so there is no reason to go fast.
 */
export function createPoliteFetch(options: PoliteFetchOptions = {}): SourceContext["fetch"] {
  const {
    minIntervalMs = 2000,
    timeoutMs = 20_000,
    retries = 2,
    userAgent = DEFAULT_USER_AGENT,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = options;
  const nextSlotByHost = new Map<string, number>();

  async function waitForSlot(host: string) {
    const now = Date.now();
    const slot = Math.max(now, nextSlotByHost.get(host) ?? 0);
    nextSlotByHost.set(host, slot + minIntervalMs);
    if (slot > now) await sleep(slot - now);
  }

  return async function politeFetch(url, init = {}) {
    const host = new URL(url).host;
    let attempt = 0;
    for (;;) {
      await waitForSlot(host);
      const headers = new Headers(init.headers);
      if (!headers.has("user-agent")) headers.set("user-agent", userAgent);
      if (!headers.has("accept-language")) headers.set("accept-language", "fr-FR,fr;q=0.9,en-GB;q=0.8,en;q=0.7");

      const response = await fetchImpl(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= retries) return response;
      attempt++;
      await sleep(minIntervalMs * 2 ** attempt);
    }
  };
}

/** Throws with the status and the start of the body when a response is not 2xx. */
export async function expectOk(response: Response, what: string): Promise<Response> {
  if (response.ok) return response;
  const body = (await response.text()).slice(0, 200);
  throw new Error(`${what}: HTTP ${response.status} ${body}`);
}
