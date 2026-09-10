import { externalKeyFor } from "@/lib/sources/normalize";
import type { RawPosting } from "@/lib/sources/types";

export type ExistingPosting = {
  id: string;
  externalKey: string;
  missCount: number;
};

export type DiffCreate = RawPosting & { externalKey: string };
export type DiffTouch = { id: string };
export type DiffMiss = { id: string; missCount: number };

export type DiffResult = {
  ok: boolean;
  reason?: string;
  toCreate: DiffCreate[];
  toTouch: DiffTouch[];
  toMiss: DiffMiss[];
};

const CLOSE_AFTER_MISSES = 2;
const SANITY_MIN_EXISTING = 6;
const SANITY_RATIO = 0.34;

export function diffPostings(existing: ExistingPosting[], fetched: RawPosting[]): DiffResult {
  const empty = { toCreate: [], toTouch: [], toMiss: [] };

  // A successful fetch that returns nothing when postings previously existed is far more likely
  // to be a broken selector/endpoint than every posting actually disappearing overnight.
  if (fetched.length === 0 && existing.length > 0) {
    return { ok: false, reason: "zero-result", ...empty };
  }

  // Dedupe within the fetch itself (defensive — a source could list the same posting twice).
  const fetchedByKey = new Map<string, RawPosting>();
  for (const posting of fetched) {
    const key = externalKeyFor(posting.url, posting.title);
    if (!fetchedByKey.has(key)) fetchedByKey.set(key, posting);
  }

  const existingByKey = new Map(existing.map((e) => [e.externalKey, e]));

  const toCreate: DiffCreate[] = [];
  const toTouch: DiffTouch[] = [];
  for (const [key, posting] of fetchedByKey) {
    const match = existingByKey.get(key);
    if (match) {
      toTouch.push({ id: match.id });
    } else {
      toCreate.push({ ...posting, externalKey: key });
    }
  }

  const unmatched = existing.filter((e) => !fetchedByKey.has(e.externalKey));

  // Fetched count far below what we previously had suggests pagination/rendering broke, not that
  // most postings closed at once — apply creates/touches but leave existing postings alone.
  const suspiciouslyLow =
    existing.length >= SANITY_MIN_EXISTING && fetched.length < existing.length * SANITY_RATIO;

  const toMiss: DiffMiss[] = suspiciouslyLow
    ? []
    : unmatched.map((e) => ({ id: e.id, missCount: e.missCount + 1 }));

  return { ok: true, toCreate, toTouch, toMiss };
}

export function shouldMarkDisappeared(missCount: number): boolean {
  return missCount >= CLOSE_AFTER_MISSES;
}
