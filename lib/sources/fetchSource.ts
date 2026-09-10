import { SourceFetchError } from "@/lib/sources/types";
import type { FetchCtx } from "@/lib/sources/types";

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;

async function fetchOnce(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": process.env.FETCH_USER_AGENT ?? "CoopHub/1.0 (personal job tracker)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new SourceFetchError(`Request to ${url} failed with status ${res.status}`, res.status);
  }
  return res;
}

async function fetchWithRetry(url: string): Promise<Response> {
  try {
    return await fetchOnce(url);
  } catch (err) {
    const status = err instanceof SourceFetchError ? err.status : undefined;
    const retryable = status == null || status >= 500;
    if (!retryable) throw err;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(url);
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
  };
}
