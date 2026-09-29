import { SourceFetchError } from "@/lib/sources/types";
import type { FetchCtx } from "@/lib/sources/types";

const TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

function userAgent(): string {
  return process.env.FETCH_USER_AGENT ?? "TappedIn/1.0 (personal job tracker)";
}

async function fetchOnce(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": userAgent(), Accept: "application/json, text/html;q=0.9, */*;q=0.8", ...init?.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new SourceFetchError(`Request to ${url} failed with status ${res.status}`, res.status);
  }
  return res;
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchOnce(url, init);
  } catch (err) {
    const status = err instanceof SourceFetchError ? err.status : undefined;
    const retryable = status == null || status >= 500 || status === 429;
    if (!retryable) throw err;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(url, init);
  }
}

export function createFetchCtx(): FetchCtx {
  return {
    async fetchText(url: string) {
      const res = await fetchWithRetry(url);
      return res.text();
    },
    async fetchJson<T = unknown>(url: string) {
      const res = await fetchWithRetry(url);
      return (await res.json()) as T;
    },
    async postJson<T = unknown>(url: string, body: unknown) {
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as T;
    },
  };
}
