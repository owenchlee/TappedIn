import { describe, expect, it } from "vitest";
import { isThirdParty, slugGuesses, titleMatch } from "./source";
import { parseResult } from "./prefill";

describe("isThirdParty", () => {
  it("flags job boards, not employers' own sites", () => {
    expect(isThirdParty("https://csjobs.ca/jobs/365161/software-developer-co-op-at-semios")).toBe(true);
    expect(isThirdParty("https://www.linkedin.com/jobs/view/4474978010")).toBe(true);
    expect(isThirdParty("https://ca.indeed.com/viewjob?jk=1")).toBe(true);
    expect(isThirdParty("https://apply.workable.com/semios/j/4B5D1FB613/")).toBe(false);
    expect(isThirdParty("https://cae.wd3.myworkdayjobs.com/career/job/x_1")).toBe(false);
  });
});

describe("titleMatch", () => {
  it("folds co-op, intern and term noise", () => {
    expect(titleMatch("Software Developer Co-op", "Software Developer Intern (Summer 2027)")).toBe(1);
    expect(titleMatch("Software Engineer Intern, Fullstack (Summer 2027 - Toronto)", "Software Engineer Intern, Fullstack")).toBeGreaterThanOrEqual(0.6);
  });
  it("doesn't match different roles", () => {
    expect(titleMatch("Software Developer Co-op", "Data Analyst Co-op")).toBeLessThan(0.6);
  });
});

describe("slugGuesses", () => {
  it("tries joined, hyphenated and trimmed names", () => {
    expect(slugGuesses("Apera AI")).toEqual(expect.arrayContaining(["aperaai", "apera-ai", "apera"]));
  });
});

describe("parseResult", () => {
  it("reads the worker's last JSON line", () => {
    expect(parseResult('Done.\n{"state":"ready","note":"All set","url":"https://x.test/apply"}')).toEqual({ state: "ready", note: "All set", url: "https://x.test/apply" });
  });
  it("treats anything else as needing Owen", () => {
    expect(parseResult("I clicked around").state).toBe("needs_you");
  });
});
