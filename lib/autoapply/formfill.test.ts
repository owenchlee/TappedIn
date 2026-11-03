import { describe, expect, it } from "vitest";
import { atsOf, formUrl, isCoverLetterField, isResumeField, matchOption, parseFillReply, roleOnPage, trimFields, wrongTerm } from "./formfill";

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
