import { describe, expect, it } from "vitest";
import { diffPostings, shouldMarkDisappeared, type ExistingPosting } from "@/lib/sources/diff";
import { externalKeyFor } from "@/lib/sources/normalize";
import type { RawPosting } from "@/lib/sources/types";

function posting(title: string, url: string): RawPosting {
  return { title, url };
}

function existingFor(title: string, url: string, overrides: Partial<ExistingPosting> = {}): ExistingPosting {
  return { id: `id-${title}`, externalKey: externalKeyFor(url, title), missCount: 0, ...overrides };
}

describe("diffPostings", () => {
  it("creates new postings not seen before", () => {
    const result = diffPostings([], [posting("Intern A", "https://x.com/a")]);
    expect(result.ok).toBe(true);
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].title).toBe("Intern A");
    expect(result.toTouch).toHaveLength(0);
    expect(result.toMiss).toHaveLength(0);
  });

  it("touches postings that are still present", () => {
    const existing = [existingFor("Intern A", "https://x.com/a")];
    const result = diffPostings(existing, [posting("Intern A", "https://x.com/a")]);
    expect(result.toTouch).toEqual([{ id: "id-Intern A" }]);
    expect(result.toCreate).toHaveLength(0);
    expect(result.toMiss).toHaveLength(0);
  });

  it("increments missCount by 1 on a single miss, which is not yet enough to flag as disappeared", () => {
    const existing = [
      existingFor("Intern A", "https://x.com/a"),
      existingFor("Intern B", "https://x.com/b"),
      existingFor("Intern C", "https://x.com/c"),
      existingFor("Intern D", "https://x.com/d"),
      existingFor("Intern E", "https://x.com/e"),
      existingFor("Intern F", "https://x.com/f"),
    ];
    // 5 of 6 still present — well above the sanity-guard ratio, so the miss pass runs normally.
    const fetched = existing.slice(0, 5).map((e) => posting(e.id.replace("id-", ""), `https://x.com/${e.id.slice(-1).toLowerCase()}`));
    const result = diffPostings(existing, fetched);
    const missed = result.toMiss.find((m) => m.id === "id-Intern F");
    expect(missed?.missCount).toBe(1);
    expect(shouldMarkDisappeared(missed!.missCount)).toBe(false);
  });

  it("flags as disappeared once missCount reaches the threshold (two consecutive misses)", () => {
    const existing = [
      existingFor("Intern A", "https://x.com/a", { missCount: 1 }),
      existingFor("Intern B", "https://x.com/b"),
      existingFor("Intern C", "https://x.com/c"),
      existingFor("Intern D", "https://x.com/d"),
      existingFor("Intern E", "https://x.com/e"),
      existingFor("Intern F", "https://x.com/f"),
    ];
    const fetched = existing.slice(1).map((e) => posting(e.id.replace("id-", ""), `https://x.com/${e.id.slice(-1).toLowerCase()}`));
    const result = diffPostings(existing, fetched);
    const missed = result.toMiss.find((m) => m.id === "id-Intern A");
    expect(missed?.missCount).toBe(2);
    expect(shouldMarkDisappeared(missed!.missCount)).toBe(true);
  });

  it("clears a miss when a posting reappears (touch, not miss)", () => {
    const existing = [existingFor("Intern A", "https://x.com/a", { missCount: 1 })];
    const result = diffPostings(existing, [posting("Intern A", "https://x.com/a")]);
    expect(result.toTouch).toEqual([{ id: "id-Intern A" }]);
    expect(result.toMiss).toHaveLength(0);
  });

  it("treats a successful fetch that returns zero postings (with prior postings) as a failed run", () => {
    const existing = [existingFor("Intern A", "https://x.com/a")];
    const result = diffPostings(existing, []);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("zero-result");
    expect(result.toCreate).toHaveLength(0);
    expect(result.toMiss).toHaveLength(0);
  });

  it("does not treat a zero-result fetch as failed when there were no existing postings", () => {
    const result = diffPostings([], []);
    expect(result.ok).toBe(true);
    expect(result.toCreate).toHaveLength(0);
  });

  it("skips the miss pass (sanity guard) when the fetched count drops far below the existing count", () => {
    const existing = Array.from({ length: 10 }, (_, i) => existingFor(`Intern ${i}`, `https://x.com/${i}`));
    // Only 2 of 10 come back — below the 34% sanity threshold — looks like a broken selector/pagination,
    // not 8 postings closing at once.
    const fetched = existing.slice(0, 2).map((e) => posting(e.id.replace("id-", ""), `https://x.com/${e.id.replace("id-Intern ", "")}`));
    const result = diffPostings(existing, fetched);
    expect(result.ok).toBe(true);
    expect(result.toMiss).toHaveLength(0);
    expect(result.toTouch).toHaveLength(2);
  });

  it("does not apply the sanity guard below the minimum existing-count threshold", () => {
    const existing = [
      existingFor("Intern A", "https://x.com/a"),
      existingFor("Intern B", "https://x.com/b"),
    ];
    // Only 1 of 2 comes back (50%, below a naive ratio check) but existing.length is under the
    // minimum sample size, so the miss pass still runs.
    const result = diffPostings(existing, [posting("Intern A", "https://x.com/a")]);
    expect(result.toMiss).toEqual([{ id: "id-Intern B", missCount: 1 }]);
  });

  it("dedupes duplicate postings within a single fetch", () => {
    const result = diffPostings([], [posting("Intern A", "https://x.com/a"), posting("Intern A", "https://x.com/a?utm=1")]);
    expect(result.toCreate).toHaveLength(1);
  });
});
