import { describe, expect, it } from "vitest";
import { externalKeyFor, regionForLocation, regionForLocations, titleKeyFor, urlKeyFor, categoryFromTitle } from "@/lib/sources/normalize";
import { termsFromText, termSortKey, termForDate, nextTerm } from "@/lib/terms";

describe("dedupe keys", () => {
  it("collapses tracking params, www, and a trailing /apply", () => {
    expect(urlKeyFor("https://www.jobs.lever.co/acme/123/apply?utm_source=simplify")).toBe(
      urlKeyFor("https://jobs.lever.co/acme/123"),
    );
  });

  it("keeps job-ID query params so distinct jobs on one page stay distinct", () => {
    expect(urlKeyFor("https://stripe.com/jobs/search?gh_jid=8128745")).not.toBe(urlKeyFor("https://stripe.com/jobs/search?gh_jid=8130805"));
    expect(urlKeyFor("https://boards.greenhouse.io/embed/job_app?token=1")).not.toBe(urlKeyFor("https://boards.greenhouse.io/embed/job_app?token=2"));
    expect(externalKeyFor("https://x.taleo.net/jobdetail.ftl?job=1", "Intern")).not.toBe(externalKeyFor("https://x.taleo.net/jobdetail.ftl?job=2", "Intern"));
    // ...while tracking params and param order still don't matter.
    expect(urlKeyFor("https://www.stripe.com/jobs/search?gh_jid=1&utm_source=Simplify&ref=Simplify")).toBe(urlKeyFor("https://stripe.com/jobs/search?gh_jid=1"));
    expect(urlKeyFor("https://a.com/j?job_id=5&gh_jid=5")).toBe(urlKeyFor("https://a.com/j?gh_jid=5&job_id=5"));
    expect(urlKeyFor("https://www.pinterestcareers.com/jobs/?gh_jid=7838577")).toBe("pinterestcareers.com/jobs?gh_jid=7838577");
  });

  it("refuses to key on a bare careers homepage", () => {
    expect(urlKeyFor("https://acme.com/careers/")).toBeNull();
    expect(urlKeyFor("https://acme.com/")).toBeNull();
  });

  it("treats Co-op / Intern / Internship and company suffixes as the same job", () => {
    expect(titleKeyFor("Ciena Corporation", "Software Developer Co-op (Winter 2027)")).toBe(
      titleKeyFor("Ciena", "Software Developer Intern (Winter 2027)"),
    );
  });

  it("keeps different terms apart", () => {
    expect(titleKeyFor("Ciena", "SWE Intern (Winter 2027)")).not.toBe(titleKeyFor("Ciena", "SWE Intern (Summer 2027)"));
  });
});

describe("regions", () => {
  it("recognizes Canadian locations", () => {
    expect(regionForLocation("Waterloo, ON")).toBe("canada");
    expect(regionForLocation("Toronto, Ontario, Canada")).toBe("canada");
    expect(regionForLocation("Remote in Canada")).toBe("canada");
  });

  it("recognizes US and remote", () => {
    expect(regionForLocation("San Francisco, CA")).toBe("us");
    expect(regionForLocation("Remote in USA")).toBe("us");
    expect(regionForLocation("Remote")).toBe("remote");
    expect(regionForLocation("London, UK")).toBe("intl");
  });

  it("recognizes Simplify's short US locations instead of dropping them as international", () => {
    for (const loc of ["SF", "South SF", "LA", "NYC", "Minnesota", "Texas", "California"]) {
      expect(regionForLocation(loc)).toBe("us");
    }
    expect(regionForLocation("Las Vegas")).toBe("intl"); // no false hit on "la" inside a word
  });

  it("lets a US state code beat a Canadian city name", () => {
    expect(regionForLocation("Hamilton, NJ")).toBe("us");
    expect(regionForLocation("New Brunswick, NJ")).toBe("us");
    expect(regionForLocation("London, ON")).toBe("canada");
    expect(regionForLocation("Hamilton")).toBe("canada");
  });

  it("prefers Canada when a posting lists several locations", () => {
    expect(regionForLocations(["New York, NY", "Toronto, ON"])).toBe("canada");
  });
});

describe("terms", () => {
  it("maps US seasons onto UW terms", () => {
    expect(termsFromText("SWE Intern (Summer 2027)")).toEqual(["S27"]);
    expect(termsFromText("Hardware Intern - Spring 2027")).toEqual(["W27"]);
    expect(termsFromText("Co-op Fall 2026 / Winter 2027")).toEqual(["F26", "W27"]);
  });

  it("falls back to a start month", () => {
    expect(termsFromText("ASIC Co-op (January 2027 - 4 months)")).toEqual(["W27"]);
    expect(termsFromText("Student, IT (May 2027)")).toEqual(["S27"]);
  });

  it("orders and advances terms", () => {
    expect(termSortKey("W27")).toBeLessThan(termSortKey("S27"));
    expect(termSortKey("S27")).toBeLessThan(termSortKey("F27"));
    expect(nextTerm("F26")).toBe("W27");
    expect(termForDate(new Date("2026-09-28T12:00:00Z"))).toBe("F26");
  });
});

describe("categories", () => {
  it("guesses from titles", () => {
    expect(categoryFromTitle("ASIC Verification Intern")).toBe("hardware");
    expect(categoryFromTitle("Machine Learning Intern")).toBe("ai_data");
    expect(categoryFromTitle("Software Developer Co-op")).toBe("software");
    expect(categoryFromTitle("Quantitative Trader Intern")).toBe("quant");
  });
});
