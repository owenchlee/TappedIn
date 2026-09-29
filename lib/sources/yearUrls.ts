import { SourceFetchError } from "@/lib/sources/types";

/**
 * Community lists are renamed every year (Summer2027-Internships → Summer2028-Internships). A config
 * URL may contain "{year}", which expands to the current recruiting year and the next one — so the
 * sources roll over by themselves. Recruiting for summer Y starts around June of Y-1.
 */
export function expandYearUrl(url: string, now: Date = new Date()): { url: string; year: number | null }[] {
  if (!url.includes("{year}")) return [{ url, year: null }];
  const base = now.getUTCFullYear() + (now.getUTCMonth() >= 5 ? 1 : 0);
  return [base, base + 1].map((year) => ({ url: url.replaceAll("{year}", String(year)), year }));
}

/** Fetches every expanded URL, skipping ones that don't exist yet (404) — but fails if none exist. */
export async function fetchAllYears<T>(
  url: string,
  fetcher: (url: string) => Promise<T>,
): Promise<{ data: T; year: number | null }[]> {
  const out: { data: T; year: number | null }[] = [];
  let lastError: unknown = null;
  for (const entry of expandYearUrl(url)) {
    try {
      out.push({ data: await fetcher(entry.url), year: entry.year });
    } catch (err) {
      if (err instanceof SourceFetchError && err.status === 404) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  if (out.length === 0) throw lastError ?? new Error(`No list found at ${url}`);
  return out;
}
