import { describe, expect, it } from "vitest";
import { isThirdParty, slugGuesses, titleMatch, untrustedSite } from "./source";
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

describe("untrustedSite", () => {
  it("trusts ATS hosts and employers' own domains", () => {
    expect(untrustedSite("https://boards.greenhouse.io/kensington/jobs/1", "Kensington")).toBeNull();
    expect(untrustedSite("https://aptiv.wd5.myworkdayjobs.com/x", "Aptiv")).toBeNull();
    expect(untrustedSite("https://jobs.ea.com/en_US/careers/x", "Electronic Arts")).toBeNull();
    expect(untrustedSite("https://careers.jdirving.com/x", "J.D. Irving")).toBeNull();
    expect(untrustedSite("https://careers.atkinsrealis.com/x", "AtkinsRéalis")).toBeNull();
    expect(untrustedSite("https://emplois.bnc.ca/x", "National Bank of Canada", ["bnc.ca"])).toBeNull();
  });
  it("holds lookalikes and unknown sites", () => {
    expect(untrustedSite("http://jobs.aptiv.com/x", "Aptiv")).toMatch(/HTTPS/);
    expect(untrustedSite("https://greenhouse.io.evil.com/x", "Kensington")).toMatch(/known job site/);
    expect(untrustedSite("https://careers-hiring-now.com/x", "Tenstorrent")).toMatch(/known job site/);
    expect(untrustedSite("https://xn--ptiv-xoa.com/x", "Aptiv")).toMatch(/punycode/);
    expect(untrustedSite("https://185.2.3.4/apply", "Aptiv")).toMatch(/IP/);
  });
});
