import { describe, expect, it } from "vitest";
import type { Job } from "./job";
import { inTargetTerm, isQueued, labelPdf, mentionsCanada, queueOrder, realismScore, spreadPicks, unrealisticTitle } from "./queue";
import { termsInText } from "@/lib/fit/requirements";

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

  it("drops a batch after three days unless it's pinned", () => {
    expect(isQueued(job("yesterday", { batch: "2026-10-04" }), now)).toBe(true);
    expect(isQueued(job("old", { batch: "2026-10-02" }), now)).toBe(false);
    expect(isQueued(job("old-pinned", { batch: "2026-10-02", pinned: true }), now)).toBe(true);
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

  it("adds each night's batch to the end, even a closing-soon or better-fit job", () => {
    const order = queueOrder([job("newer", { fitScore: 95, deadline: day(1) }), job("older", { batch: "2026-10-04", fitScore: 60 })], now).map((j) => j.id);
    expect(order).toEqual(["older", "newer"]);
  });

  it("puts a pinned job ahead of everything", () => {
    const order = queueOrder([job("closing", { fitScore: 90, deadline: day(1) }), job("pinned", { pinned: true })], now).map((j) => j.id);
    expect(order).toEqual(["pinned", "closing"]);
  });
});

describe("picking rules", () => {
  it("skips roles a first-year won't realistically get", () => {
    expect(unrealisticTitle("Senior Software Engineer Intern")).toBe(true);
    expect(unrealisticTitle("Student Researcher Intern")).toBe(true);
    expect(unrealisticTitle("PhD Researcher Intern - Machine Learning")).toBe(true);
    expect(unrealisticTitle("Software Engineering Co-op")).toBe(false);
    expect(unrealisticTitle("Android Applications Developer Intern")).toBe(false);
  });

  it("only counts a remote job when the posting mentions Canada", () => {
    expect(mentionsCanada("Remote within the US or Canada")).toBe(true);
    expect(mentionsCanada("Open to students in Ontario")).toBe(true);
    expect(mentionsCanada("Remote, United States only")).toBe(false);
  });

  it("ranks an early-student-friendly, fresh posting above a slightly better fit", () => {
    const base = { fitReasons: [] as string[], postedAt: null, firstSeenAt: new Date(now.getTime() - 20 * 86_400_000) };
    const fresh = { fitScore: 70, fitReasons: ["+Open to 1st/2nd years"], postedAt: null, firstSeenAt: new Date(now.getTime() - 86_400_000) };
    expect(realismScore(fresh, now)).toBeGreaterThan(realismScore({ ...base, fitScore: 85 }, now));
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

describe("inTargetTerm", () => {
  const s27 = ["S27"];
  it("takes postings for the target term, or that never say their term (most are summer)", () => {
    expect(inTargetTerm(["S27"], "Software Intern", s27)).toBe(true);
    expect(inTargetTerm(["W27"], "Data Analyst Co-op", s27)).toBe(false);
    expect(inTargetTerm([], "Software Engineer Co-op", s27)).toBe(true);
    expect(inTargetTerm([], "Software Engineer Co-op", s27, ["W27"])).toBe(false);
    expect(inTargetTerm(["S27", "W27", "F27"], "Software Development Engineer Intern", s27)).toBe(true);
  });

  it("rejects a multi-term placement that starts before the target term", () => {
    expect(inTargetTerm(["W27", "S27"], "NPI Hardware Co-op - 8 month", s27)).toBe(false);
    expect(inTargetTerm(["S27", "F27"], "Firmware Co-op (8 months)", s27)).toBe(true);
  });
});

describe("inTargetTerm with the posting's own text", () => {
  it("trusts the posting over a list's term tag", () => {
    expect(inTargetTerm(["S27"], "Electronics Design Co-op", ["S27"], termsInText("Electronics Design Co-op (Jan 2027)"))).toBe(false);
    expect(inTargetTerm(["S27"], "Systems Engineer Co-op", ["S27"], termsInText("Must be able to complete a 16 month Co-Op term starting May 2026"))).toBe(false);
    expect(inTargetTerm(["S27"], "Silicon Intern", ["S27"], termsInText("For 16-month internships: must be available May/June 2027 - August/September 2028"))).toBe(true);
  });
});

describe("labelPdf", () => {
  it("builds a PDF whose xref points at each object", () => {
    const pdf = labelPdf(["FOR Qualcomm - Silicon (Validation) Intern", "Label only."]).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("(FOR Qualcomm - Silicon \\(Validation\\) Intern) Tj");
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(pdf.slice(Number(pdf.match(/startxref\n(\d+)/)![1])).startsWith("xref")).toBe(true);
  });
});
