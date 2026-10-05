import { describe, expect, it } from "vitest";
import type { Job } from "./job";
import { isQueued, queueOrder, spreadPicks, topUpCount } from "./queue";

const now = new Date("2026-10-05T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

function job(id: string, extra: Partial<Job> = {}): Job {
  return {
    id,
    createdAt: "2026-10-05T06:00:00Z",
    updatedAt: "2026-10-05T06:00:00Z",
    source: { kind: "coop", id },
    company: id,
    role: "Intern",
    url: "https://example.com",
    status: "ready",
    steps: { open: { state: "done" }, tailor: { state: "done" }, cover_letter: { state: "skipped" } },
    batch: "2026-10-05",
    log: [],
    ...extra,
  };
}

describe("isQueued", () => {
  it("only counts nightly jobs that are ready and untouched", () => {
    expect(isQueued(job("a"), now)).toBe(true);
    expect(isQueued(job("b", { batch: undefined }), now)).toBe(false);
    expect(isQueued(job("c", { submittedAt: day(0) }), now)).toBe(false);
    expect(isQueued(job("d", { skippedAt: day(0) }), now)).toBe(false);
    expect(isQueued(job("e", { status: "failed" }), now)).toBe(false);
    expect(isQueued(job("f", { deadline: day(-2) }), now)).toBe(false);
  });
});

describe("queueOrder", () => {
  it("puts jobs closing within three days first, then the best fit", () => {
    const order = queueOrder(
      [job("low", { fitScore: 55 }), job("high", { fitScore: 90 }), job("closing", { fitScore: 60, deadline: day(2) }), job("later", { fitScore: 95, deadline: day(10) })],
      now,
    ).map((j) => j.id);
    expect(order).toEqual(["closing", "later", "high", "low"]);
  });

  it("puts a pinned job ahead of everything", () => {
    const order = queueOrder([job("closing", { fitScore: 90, deadline: day(1) }), job("pinned", { pinned: true })], now).map((j) => j.id);
    expect(order).toEqual(["pinned", "closing"]);
  });
});

describe("topUpCount", () => {
  it("tops the queue back up to the target", () => {
    expect(topUpCount([job("a"), job("b"), job("c", { submittedAt: day(0) })], 15, now)).toBe(13);
    expect(topUpCount(Array.from({ length: 20 }, (_, i) => job(`j${i}`)), 15, now)).toBe(0);
  });
});

describe("spreadPicks", () => {
  it("takes at most two from one company", () => {
    const rows = ["RBC", "RBC", "rbc", "Shopify", "RBC", "Wealthsimple"].map((company, i) => ({ company, role: `Role ${i}` }));
    expect(spreadPicks(rows, 4).map((r) => r.company)).toEqual(["RBC", "RBC", "Shopify", "Wealthsimple"]);
  });

  it("skips a second posting of the same title", () => {
    const rows = [
      { company: "AMD", role: "Software Engineer Intern/Co-op" },
      { company: "AMD", role: "Software Engineer  Intern/Co-op" },
      { company: "AMD", role: "Hardware Intern" },
    ];
    expect(spreadPicks(rows, 5).map((r) => r.role)).toEqual(["Software Engineer Intern/Co-op", "Hardware Intern"]);
  });
});
