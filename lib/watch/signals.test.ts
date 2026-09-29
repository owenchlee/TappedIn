import { describe, expect, it } from "vitest";
import { extractText, scanText, signalFor } from "@/lib/watch/signals";

const now = new Date("2026-09-28T12:00:00Z");

describe("scanText", () => {
  it("detects open applications", () => {
    expect(scanText("Hack Western 13 — Apply now!", now).level).toBe("open");
    expect(scanText("Hacker applications are now open.", now).level).toBe("open");
  });

  it("treats 'applications open in October' as soon, not open", () => {
    expect(scanText("Hacker applications will be released in mid-October.", now).level).toBe("soon");
    expect(scanText("Applications open in January", now).level).toBe("soon");
    expect(scanText("Mark your calendars: Sept 17-19, 2027", now).level).toBe("soon");
  });

  it("doesn't mistake 'notify me when applications open' pages for open ones (real site copy)", () => {
    // makeuoft.ca and deltahacks.com, Sept 2026
    expect(scanText("Leave your info below and we'll email you as soon as applications open.", now).level).toBe("soon");
    expect(scanText("Follow us on socials to find out as soon as applications open.", now).level).toBe("soon");
    // uwblueprint.org — evergreen description, not an announcement
    expect(scanText("Our applications open ~2 months before the term begins.", now).level).toBe("none");
    expect(scanText("Applications open now!", now).level).toBe("open");
  });

  it("an explicit 'closed' wins over apply links elsewhere on the page", () => {
    expect(scanText("Applications are now closed. Apply now for mentors!", now).level).toBe("none");
  });

  it("finds the latest nearby year, ignoring far-past copyright years", () => {
    expect(scanText("© 2015 Hack the North. See you in 2027!", now).maxYear).toBe(2027);
    expect(scanText("Since 2015", now).maxYear).toBeNull();
  });
});

describe("signalFor", () => {
  it("alerts on first check only if it's already open or announced", () => {
    expect(signalFor({ level: null, maxYear: null }, { level: "none", maxYear: 2026, textLength: 10 })).toBeNull();
    expect(signalFor({ level: null, maxYear: null }, { level: "open", maxYear: 2026, textLength: 10 })).toMatch(/open/);
  });

  it("alerts on escalation and on a new year appearing", () => {
    expect(signalFor({ level: "none", maxYear: 2026 }, { level: "soon", maxYear: 2026, textLength: 10 })).toMatch(/upcoming/);
    expect(signalFor({ level: "soon", maxYear: 2026 }, { level: "open", maxYear: 2026, textLength: 10 })).toMatch(/open/);
    expect(signalFor({ level: "none", maxYear: 2026 }, { level: "none", maxYear: 2027, textLength: 10 })).toMatch(/2027/);
  });

  it("stays quiet when nothing moved forward", () => {
    expect(signalFor({ level: "open", maxYear: 2026 }, { level: "none", maxYear: 2026, textLength: 10 })).toBeNull();
    expect(signalFor({ level: "soon", maxYear: 2027 }, { level: "soon", maxYear: 2027, textLength: 10 })).toBeNull();
  });
});

describe("extractText", () => {
  it("drops scripts and keeps meta descriptions", () => {
    const html = `<html><head><title>X</title><meta name="description" content="Apply now"></head>
      <body><script>var applyNow = 1</script><p>Hello</p></body></html>`;
    const text = extractText(html);
    expect(text).toContain("Apply now");
    expect(text).toContain("Hello");
    expect(text).not.toContain("applyNow");
  });
});
