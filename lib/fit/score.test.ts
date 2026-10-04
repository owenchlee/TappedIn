import { describe, expect, it } from "vitest";
import { defaultPrefs, defaultTargetTerm, parsePrefs } from "@/lib/fit/prefs";
import { matchedSkills, scoreJob, type FitInput } from "@/lib/fit/score";

const now = new Date("2026-10-04T12:00:00Z");
const prefs = defaultPrefs(now);

function job(over: Partial<FitInput> = {}): FitInput {
  return {
    role: "Software Engineer Intern",
    terms: ["S27"],
    category: "software",
    region: "us",
    postedAt: new Date("2026-10-01T00:00:00Z"),
    firstSeenAt: new Date("2026-10-02T00:00:00Z"),
    deadline: null,
    details: "We use Python and React. You will ship features.",
    detailsStatus: "ok",
    ...over,
  };
}

describe("prefs", () => {
  it("targets the coming Spring/Summer term by default", () => {
    expect(defaultTargetTerm(now)).toBe("S27");
    expect(defaultTargetTerm(new Date("2027-06-01T00:00:00Z"))).toBe("S28");
  });
  it("falls back to defaults on bad JSON and keeps valid fields", () => {
    expect(parsePrefs("not json", now)).toEqual(prefs);
    expect(parsePrefs(JSON.stringify({ targetTerms: ["W27"] }), now).targetTerms).toEqual(["W27"]);
  });
});

describe("matchedSkills", () => {
  it("matches whole tokens, case-sensitively", () => {
    expect(matchedSkills("Experience with C++, Python and Next.js", ["C++", "Python", "Next.js", "Java"])).toEqual(["C++", "Python", "Next.js"]);
    expect(matchedSkills("Familiar with JavaScript", ["Java"])).toEqual([]);
    expect(matchedSkills("Be able to express ideas and react quickly", ["Express", "React"])).toEqual([]);
  });
});

describe("scoreJob", () => {
  it("ranks a Canadian co-op for your term open to first years above a generic US internship", () => {
    const coop = scoreJob(job({ role: "Software Developer Co-op", region: "canada", details: "Open to first-year students in a co-op program. Python, React." }), prefs, now);
    const us = scoreJob(job(), prefs, now);
    expect(coop.score).toBeGreaterThan(us.score);
    expect(coop.reasons).toContain("+Open to 1st/2nd years");
    expect(coop.flags).toEqual([]);
  });

  it("blocks postings for other graduating classes", () => {
    const fit = scoreJob(job({ details: "• Graduation date between December 2027 and June 2028" }), prefs, now);
    expect(fit.flags).toContain("grad_year");
    expect(fit.reasons[0]).toBe("-For grads 2027–2028");
  });

  it("allows open-ended windows that include your year", () => {
    const fit = scoreJob(job({ details: "graduating December 2027 or later" }), prefs, now);
    expect(fit.flags).not.toContain("grad_year");
  });

  it("blocks jobs whose only term already started, and taken-down postings", () => {
    expect(scoreJob(job({ terms: ["S26"] }), prefs, now).flags).toContain("past_term");
    expect(scoreJob(job({ detailsStatus: "gone", details: null }), prefs, now).flags).toContain("gone");
  });

  it("penalises the wrong term and non-tech roles without blocking them", () => {
    const fit = scoreJob(job({ terms: ["F27"], category: "other" }), prefs, now);
    expect(fit.flags).toEqual([]);
    expect(fit.reasons).toEqual(expect.arrayContaining(["-Not Summer '27", "-Not a tech role"]));
  });

  it("notes when the posting couldn't be read", () => {
    expect(scoreJob(job({ details: null, detailsStatus: "unsupported" }), prefs, now).flags).toContain("unreadable");
    expect(scoreJob(job({ details: null, detailsStatus: null }), prefs, now).flags).not.toContain("unreadable");
  });

  it("pushes jobs that close this week up, and says when", () => {
    const soon = scoreJob(job({ deadline: new Date("2026-10-06T12:00:00Z") }), prefs, now);
    const later = scoreJob(job({ deadline: new Date("2026-11-20T12:00:00Z") }), prefs, now);
    expect(soon.score).toBeGreaterThan(later.score);
    expect(soon.reasons).toContain("+Closes in 2 days");
    expect(scoreJob(job({ deadline: new Date("2026-10-04T12:00:00Z") }), prefs, now).reasons).toContain("+Closes today");
  });

  it("stays within 0-100", () => {
    const worst = scoreJob(job({ role: "PhD MBA Intern", terms: ["S26"], region: "intl", category: "other", details: "Must be a U.S. citizen. Rising senior. Graduation 2027." }), prefs, now);
    expect(worst.score).toBe(0);
  });
});
