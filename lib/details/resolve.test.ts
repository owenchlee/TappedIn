import { describe, expect, it } from "vitest";
import { resolveDetailTarget } from "@/lib/details/resolve";
import { extractFromHtml, htmlToText } from "@/lib/details/fetch";

// Real links from the SimplifyJobs / Canadian lists.
describe("resolveDetailTarget", () => {
  it("maps Greenhouse boards and embeds to the boards API", () => {
    expect(resolveDetailTarget("https://job-boards.greenhouse.io/astranis/jobs/4705214006")).toEqual({
      kind: "greenhouse",
      api: "https://boards-api.greenhouse.io/v1/boards/astranis/jobs/4705214006",
    });
    expect(resolveDetailTarget("https://boards.greenhouse.io/embed/job_app?for=gemini&token=8214272&gh_jid=8214272")).toEqual({
      kind: "greenhouse",
      api: "https://boards-api.greenhouse.io/v1/boards/gemini/jobs/8214272",
    });
  });

  it("reads a company site with ?gh_jid= as a page, since the board name is unknown", () => {
    expect(resolveDetailTarget("https://careers.withwaymo.com/jobs?gh_jid=8243732")?.kind).toBe("html");
  });

  it("maps Lever, Ashby, SmartRecruiters and Workable", () => {
    expect(resolveDetailTarget("https://jobs.lever.co/pentagrp/501478ea-6890-47e2-8994-96e50b1159f0/apply")).toEqual({
      kind: "lever",
      api: "https://api.lever.co/v0/postings/pentagrp/501478ea-6890-47e2-8994-96e50b1159f0",
    });
    expect(resolveDetailTarget("https://jobs.ashbyhq.com/the-exploration-company/86270058-8eec-4692-b49d-97ce59fd54ac/application?embed=true")).toEqual({
      kind: "ashby",
      org: "the-exploration-company",
      id: "86270058-8eec-4692-b49d-97ce59fd54ac",
    });
    expect(resolveDetailTarget("https://jobs.smartrecruiters.com/Wabtec/3743990015854776")).toEqual({
      kind: "smartrecruiters",
      api: "https://api.smartrecruiters.com/v1/companies/Wabtec/postings/3743990015854776",
    });
    expect(resolveDetailTarget("https://apply.workable.com/disa-technologies/j/73E7609B99/apply")).toEqual({
      kind: "workable",
      api: "https://apply.workable.com/api/v2/accounts/disa-technologies/jobs/73E7609B99",
    });
  });

  it("maps Workday job links, with or without a locale segment", () => {
    expect(resolveDetailTarget("https://abb.wd3.myworkdayjobs.com/external_career_page/job/New-Berlin-Wisconsin-United-States-of-America/Product-Management-Intern---Summer-2027_JR00047280")).toEqual({
      kind: "workday",
      api: "https://abb.wd3.myworkdayjobs.com/wday/cxs/abb/external_career_page/job/New-Berlin-Wisconsin-United-States-of-America/Product-Management-Intern---Summer-2027_JR00047280",
    });
    expect(resolveDetailTarget("https://intel.wd1.myworkdayjobs.com/en-us/external/job/Virtual-Canada/Firmware-Development-Undergraduate-Engineering-Co-op_JR0286862")).toEqual({
      kind: "workday",
      api: "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/external/job/Virtual-Canada/Firmware-Development-Undergraduate-Engineering-Co-op_JR0286862",
    });
  });

  it("maps Oracle Cloud candidate pages to the REST API", () => {
    const t = resolveDetailTarget("https://fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/39968");
    expect(t?.kind).toBe("oracle");
    expect(t && "api" in t && decodeURIComponent(t.api)).toContain('finder=ById;Id="39968",siteNumber=CX_1');
  });

  it("rejects links it can't use", () => {
    expect(resolveDetailTarget("not a url")).toBeNull();
    expect(resolveDetailTarget("mailto:jobs@example.com")).toBeNull();
    expect(resolveDetailTarget("https://jobs.lever.co/pentagrp")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("unescapes Greenhouse's entity-encoded HTML and keeps list structure", () => {
    const text = htmlToText("&lt;p&gt;About us&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;");
    expect(text).toBe("About us\n• Python\n• SQL");
  });
  it("turns Workday's double-escaped line breaks into newlines", () => {
    expect(htmlToText("<p>Date Posted: 2026-09-09&amp;#xa;&amp;#xa;Country: US</p>")).toBe("Date Posted: 2026-09-09\n\nCountry: US");
  });
});

describe("extractFromHtml", () => {
  const filler = "You will build things. Qualifications: experience with Python. ".repeat(10);
  it("prefers JSON-LD JobPosting", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: `<p>${filler}</p>` })}</script></head><body>menu</body></html>`;
    const r = extractFromHtml(html, "https://example.com/job/1");
    expect(r.status).toBe("ok");
  });
  it("recognises a removed posting on a short page", () => {
    const r = extractFromHtml("<html><body><main><h1>Sorry</h1><p>This job is no longer available.</p></main></body></html>", "https://example.com/job/1");
    expect(r.status).toBe("gone");
  });
  it("calls a JavaScript-only shell unsupported, not gone", () => {
    const r = extractFromHtml('<html><body><div id="root"></div><script>app()</script></body></html>', "https://example.com/job/1");
    expect(r.status).toBe("unsupported");
  });
});
