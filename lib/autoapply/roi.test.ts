import { describe, expect, it } from "vitest";
import { roiScore, type RoiInput } from "./roi";

const now = new Date("2026-10-13T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const base: RoiInput = { company: "Acme Robotics", role: "Software Intern", region: "canada", fitScore: 75, postedAt: daysAgo(1) };

describe("roiScore", () => {
  it("scores a fresh, first-year-friendly Canadian job at a small company near the top", () => {
    expect(roiScore({ ...base, fitScore: 90, fitReasons: ["+Open to 1st/2nd years"] }, now).score).toBe(100);
  });

  it("drops as the posting ages past four days", () => {
    const fresh = roiScore(base, now).score;
    const week = roiScore({ ...base, postedAt: daysAgo(7) }, now).score;
    const month = roiScore({ ...base, postedAt: daysAgo(30) }, now).score;
    expect(fresh).toBeGreaterThan(week);
    expect(week).toBeGreaterThan(month);
    expect(roiScore({ ...base, postedAt: daysAgo(4) }, now).score).toBe(fresh);
  });

  it("puts a household name well below a smaller company", () => {
    expect(roiScore(base, now).score - roiScore({ ...base, company: "Amazon" }, now).score).toBe(22);
  });

  it("rewards postings open to early students and penalizes upper-year ones", () => {
    const early = roiScore({ ...base, fitReasons: ["+Open to 1st/2nd years"] }, now).score;
    const upper = roiScore({ ...base, flags: ["upper_pref"] }, now).score;
    const senior = roiScore({ ...base, role: "Senior Software Engineer" }, now).score;
    expect(early).toBeGreaterThan(roiScore(base, now).score);
    expect(upper).toBeGreaterThan(senior);
    expect(roiScore(base, now).score).toBeGreaterThan(upper);
  });

  it("treats a PM internship as an internship and reads co-op/student titles as co-ops", () => {
    expect(roiScore({ ...base, role: "Product Manager Intern" }, now).parts[2].label).toBe("Year not specified");
    expect(roiScore({ ...base, role: "Senior Product Manager" }, now).parts[2].label).toBe("Senior/grad-level title");
    expect(roiScore({ ...base, role: "Software Developer Coop-EN" }, now).parts[2].label).toBe("Co-op friendly");
    expect(roiScore({ ...base, role: "Dev Ops Engineer (Student Position)" }, now).parts[2].label).toBe("Co-op friendly");
  });

  it("ages a job with no posting date from the night it was tailored", () => {
    const tailored = roiScore({ ...base, postedAt: null, foundAt: daysAgo(4) }, now);
    expect(tailored.parts[0].label).toBe("Found 4d ago");
    expect(tailored.score).toBeLessThan(roiScore({ ...base, postedAt: null, foundAt: daysAgo(0) }, now).score);
  });

  it("prefers Canada over a U.S. role that won't sponsor, and cuts jobs with red flags", () => {
    expect(roiScore(base, now).score).toBeGreaterThan(roiScore({ ...base, region: "us" }, now).score);
    expect(roiScore({ ...base, region: "us", flags: ["sponsors"] }, now).score).toBeGreaterThan(roiScore({ ...base, region: "us" }, now).score);
    expect(roiScore({ ...base, warnings: ["U.S. citizens only"] }, now).score).toBeLessThan(roiScore(base, now).score * 0.5);
    expect(roiScore({ ...base, flags: ["grad_year"] }, now).score).toBeLessThan(roiScore(base, now).score * 0.5);
  });
});
