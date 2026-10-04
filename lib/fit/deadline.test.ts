import { describe, expect, it } from "vitest";
import { extractDeadline } from "@/lib/fit/deadline";

const posted = new Date("2026-09-20T00:00:00Z");
const day = (text: string, at: Date = posted) => extractDeadline(text, at)?.toISOString().slice(0, 10) ?? null;

// Wording from real postings (Oct 2026).
describe("extractDeadline", () => {
  it.each([
    ["Application Deadline: October 31, 2026", "2026-10-31"],
    ["• Deadline to submit application: October 17", "2026-10-17"],
    ["Deadline to Apply: 10/15/26", "2026-10-15"],
    ["The application window will close on Friday, November 13th, 2026, at 11:59PM ET or when role(s) have been filled", "2026-11-13"],
    ["Application close:  30th October, however we recommend an early application", "2026-10-30"],
    ["We anticipate the application window for this opening will close on - 16 Oct 2026", "2026-10-16"],
    ["This job posting closes on October 4, 2026", "2026-10-04"],
    ["Closing Date (MM/DD/YYYY):\n10/27/2026\n\nWorker Type:", "2026-10-27"],
    ["The deadline to apply is November 1, 2026", "2026-11-01"],
    ["This job posting is anticipated to close on [8/13/2027]", "2027-08-13"],
  ])("%s", (text, want) => {
    expect(day(text)).toBe(want);
  });

  it("takes the day before when the posting says applications close the day prior (RBC, Merck)", () => {
    expect(day("Posted Date:\n\n2026-09-23Application Deadline:\n\n2026-10-05Note: Applications will be accepted until 11:59 PM on the day prior to the application deadline")).toBe("2026-10-04");
    expect(day("Job Posting End Date:\n10/9/2026*A job posting is effective until 11:59:59PM on the day BEFORE the listed job posting end date.")).toBe("2026-10-08");
  });

  it("reads day/month dates when month/day would be before the posting (Sun Life)", () => {
    expect(day("Posting End Date:\n23/10/2026", new Date("2026-09-18T00:00:00Z"))).toBe("2026-10-23");
    expect(day("Posting End Date:\n08/11/2026", new Date("2026-09-14T00:00:00Z"))).toBe("2026-11-08");
  });

  it("ignores postings that say there is no deadline", () => {
    expect(day("Application deadline\nAmgen does not have an application deadline for this position; we will continue accepting applications")).toBeNull();
    expect(day("Application Deadline: Trimble accepts applications on an ongoing basis until the position is filled")).toBeNull();
    expect(day("This posting will be open until at least September 10th, 2026")).toBeNull();
    expect(day("• Ability to work in a fast-paced and deadline-oriented environment. Founded October 3, 2001.")).toBeNull();
  });

  it("ignores dates that can't be this posting's deadline", () => {
    // Already over when posted.
    expect(day("Application Deadline: March 1, 2026")).toBeNull();
  });
});
