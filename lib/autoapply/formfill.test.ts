import { describe, expect, it } from "vitest";
import { atsOf, formUrl, isCoverLetterField, isPortfolioField as _pf, wrongTerm as _wt, isResumeField, matchOption, parseFillReply, roleOnPage, trimFields, wrongTerm } from "./formfill";

describe("atsOf / formUrl", () => {
  it("recognises the three supported ATSs by host", () => {
    expect(atsOf("https://job-boards.greenhouse.io/x/jobs/1")).toBe("greenhouse");
    expect(atsOf("https://jobs.lever.co/x/abc")).toBe("lever");
    expect(atsOf("https://jobs.ashbyhq.com/x/abc")).toBe("ashby");
    expect(atsOf("https://acme.wd3.myworkdayjobs.com/en/job")).toBeNull();
    expect(atsOf("https://evilgreenhouse.io/x")).toBeNull();
    expect(atsOf(undefined)).toBeNull();
  });
  it("points Lever and Ashby at the page that holds the form", () => {
    expect(formUrl("lever", "https://jobs.lever.co/x/abc")).toBe("https://jobs.lever.co/x/abc/apply");
    expect(formUrl("lever", "https://jobs.lever.co/x/abc/apply")).toBe("https://jobs.lever.co/x/abc/apply");
    expect(formUrl("ashby", "https://jobs.ashbyhq.com/x/abc/")).toBe("https://jobs.ashbyhq.com/x/abc/application");
    expect(formUrl("greenhouse", "https://job-boards.greenhouse.io/x/jobs/1")).toBe("https://job-boards.greenhouse.io/x/jobs/1");
  });
});

describe("matchOption", () => {
  const opts = ["Yes", "No", "No, I am not currently legally authorized to work", "Decline To Self Identify"];
  it("prefers an exact match, ignoring case and punctuation", () => {
    expect(matchOption(opts, "yes")).toBe("Yes");
    expect(matchOption(opts, "decline to self-identify")).toBe("Decline To Self Identify");
  });
  it("falls back to containment either way", () => {
    expect(matchOption(opts, "No, I am not currently legally authorized")).toBe("No, I am not currently legally authorized to work");
    expect(matchOption(["Waterloo, Ontario, Canada"], "Waterloo")).toBe("Waterloo, Ontario, Canada");
  });
  it("returns undefined when nothing fits", () => {
    expect(matchOption(opts, "maybe")).toBeUndefined();
    expect(matchOption(opts, "")).toBeUndefined();
  });
});

describe("parseFillReply", () => {
  it("reads the last JSON line", () => {
    const r = parseFillReply('thinking...\n{"answers": {"f0": "Owen", "f1": true, "f2": ["a", "b"], "f3": 5}, "ask": ["f9"]}');
    expect(r).toEqual({ answers: { f0: "Owen", f1: true, f2: ["a", "b"] }, ask: ["f9"] });
  });
  it("rejects replies without answers", () => {
    expect(parseFillReply("nope")).toBeNull();
    expect(parseFillReply('{"ask": []}')).toBeNull();
  });
});

describe("trimFields", () => {
  it("drops duplicate keys, trims labels and drops the required marker", () => {
    const out = trimFields([
      { key: "a", kind: "text", label: "  Email \n *", required: true },
      { key: "a", kind: "text", label: "dup", required: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Email");
  });
});

describe("field labels", () => {
  it("tells the resume from the cover letter", () => {
    expect(isResumeField("Resume/CV ATTACH RESUME/CV")).toBe(true);
    expect(isCoverLetterField("Cover Letter Attach")).toBe(true);
    expect(isResumeField("Cover Letter (resume optional)")).toBe(false);
  });
});

describe("submit gates", () => {
  it("flags a posting for another term unless Summer 2027 is named", () => {
    expect(wrongTerm("Software Intern, Winter 2027")).toBe("Winter 2027");
    expect(wrongTerm("Open to Summer 2027 and Fall 2027")).toBeNull();
    expect(wrongTerm("Join us for six months")).toBeNull();
  });
  it("checks the role's words appear on the page", () => {
    expect(roleOnPage("Hardware Security Engineer Intern (Summer 2027)", "Hardware Security Engineer Intern San Francisco")).toBe(true);
    expect(roleOnPage("Hardware Security Engineer Intern", "Senior Marketing Manager")).toBe(false);
  });
});


describe("isPortfolioField", () => {
  it("matches portfolio boxes, not resume or transcript", () => {
    expect(_pf("Engineering Portfolio")).toBe(true);
    expect(_pf("Portfolio - File upload")).toBe(true);
    expect(_pf("Resume / portfolio")).toBe(false);
    expect(_pf("Unofficial transcript")).toBe(false);
  });
});

describe("wrongTerm start dates", () => {
  it("catches a required winter start even without the word winter", () => {
    expect(_wt("This Internship requires you to be able to start no later than Monday January 4th, 2027.")).toMatch(/January 4th, 2027/);
    expect(_wt("Summer 2027 internship. Start date: May 3, 2027")).toBeNull();
    expect(_wt("I am available to begin a potential full-time role before September 2028.")).toBeNull();
  });
});

describe("offTermTitle", () => {
  it("catches a bare season in a title or link", async () => {
    const { offTermTitle } = await import("./formfill");
    expect(offTermTitle("https://x.wd3.myworkdayjobs.com/job/Developper-Pharmaceutical-Distirbution---Winter-Intern_JR0154903")).toBe("Winter Intern");
    expect(offTermTitle("Software Fall 2027 Co-op")).toBeTruthy();
    expect(offTermTitle("Software Developer Intern (Summer 2027)")).toBeNull();
    expect(offTermTitle("Embedded Software Intern")).toBeNull();
    expect(offTermTitle("Spring Health Data Intern")).toBeNull();
  });
});

describe("savedAnswerFor", () => {
  it("uses an exact saved question, skips conditional answers", async () => {
    const { savedAnswerFor } = await import("./formfill");
    const bank = [
      { q: "What is your GPA?", a: "N/A" },
      { q: "Do you currently possess a valid, active driver's license? / Possédez-vous un permis de conduire canadien valide ?", a: "Yes (Owen has a valid driver's license, confirmed 2026-11-06)" },
      { q: "Are you legally eligible to work in the country?", a: "Yes when the job is in Canada. No when the job is in the U.S." },
    ];
    expect(savedAnswerFor("What is your GPA?*", undefined, bank)).toBe("N/A");
    expect(savedAnswerFor("Do you currently possess a valid, active driver's license?", ["Yes", "No"], bank)).toBe("Yes");
    expect(savedAnswerFor("Possédez-vous un permis de conduire canadien valide ?", ["Oui", "Non"], bank)).toBeNull();
    expect(savedAnswerFor("Are you legally eligible to work in the country?", ["Yes", "No"], bank)).toBeNull();
    expect(savedAnswerFor("What is your favourite colour?", undefined, bank)).toBeNull();
  });
});

describe("selfId", () => {
  it("spots self-ID questions only", async () => {
    const { selfId, matchOption } = await import("./formfill");
    expect(selfId("Do you identify as a gender different than the one assigned to you at birth?")).toBe(true);
    expect(selfId("Are you legally authorized to work in Canada?")).toBe(false);
    expect(matchOption(["Yes", "No", "I don't wish to answer"], "I don't wish to answer")).toBe("I don't wish to answer");
    expect(matchOption(["Yes", "No", "Prefer not to say"], "I don't wish to answer")).toBe("Prefer not to say");
  });
});
