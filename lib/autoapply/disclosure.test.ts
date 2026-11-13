import { describe, expect, it } from "vitest";
import { dateAnswer, disclosureNo, heardAboutPick, isDisclosure } from "./scriptfill";

const yn = ["Yes", "No"];

describe("disclosureNo", () => {
  it("answers No to conflict-of-interest questions", () => {
    expect(disclosureNo("6). Do you own, control, or have an economic interest in any intellectual property rights (patents, trademarks, or copyrights)?", yn)).toBe("No");
    expect(disclosureNo("7). If hired, do you intend to maintain any secondary non-Altera employment or engage in a non-Altera business activity?", yn)).toBe("No");
    expect(disclosureNo("8). Do you sit on the board of directors or similar governing body of a non-Altera entity?", yn)).toBe("No");
    expect(disclosureNo("Do you have any relatives currently employed by Acme?", ["Yes", "No, I do not"])).toBe("No, I do not");
    expect(disclosureNo("Are you bound by a non-compete agreement?", yn)).toBe("No");
    expect(disclosureNo("Are you a current or former government official?", yn)).toBe("No");
    expect(disclosureNo("...export control laws of the United States... Are you a citizen or dual citizen of Cuba, Iran, North Korea, Syria or North Sudan?", ["Select One", "Yes", "No"])).toBe("No");
  });

  it("leaves other questions alone", () => {
    expect(isDisclosure("Are you legally authorized to work in Canada?")).toBe(false);
    expect(isDisclosure("Highest level of post-secondary education")).toBe(false);
    expect(isDisclosure("Will you require sponsorship?")).toBe(false);
    expect(isDisclosure("Have you previously worked for Acme?")).toBe(false);
    expect(disclosureNo("Do you hold any patents?", undefined)).toBe(null);
    expect(disclosureNo("Do you hold any patents?", ["Please describe"])).toBe(null);
  });
});

describe("dateAnswer", () => {
  const today = new Date(2026, 10, 4);
  it("start dates are May 3, 2027; today's date is today", () => {
    expect(dateAnswer("Quand pouvez-vous commencer ?*", today)).toBe("05/03/2027");
    expect(dateAnswer("When are you available to start?", today)).toBe("05/03/2027");
    expect(dateAnswer("Today's Date", today)).toBe("11/04/2026");
    expect(dateAnswer("Date*", today)).toBe("11/04/2026");
  });
  it("leaves other dates alone", () => {
    expect(dateAnswer("Date of birth", today)).toBe(null);
    expect(dateAnswer("Graduation date", today, "")).toBe(null);
  });
  it("graduation comes from the profile", () => {
    expect(dateAnswer("2. When are you expected to graduate from your study program?*", today, "2031-06")).toBe("06/01/2031");
  });
});

describe("heardAboutPick", () => {
  it("picks the careers site, then LinkedIn, then Other", () => {
    expect(heardAboutPick("How Did You Hear About Us?", ["Select One", "Alumni", "Company Career Website", "LinkedIn"])).toBe("Company Career Website");
    expect(heardAboutPick("How Did You Hear About Us?", ["Select One", "Alumni", "Employee Referral", "Indeed", "LinkedIn", "LinkedIn Job posting", "Radio advertising"])).toBe("LinkedIn Job posting");
    expect(heardAboutPick("How did you hear about this job?", ["Referral", "Other"])).toBe("Other");
  });
  it("leaves other questions alone", () => {
    expect(heardAboutPick("Are you legally authorized to work in Canada?", ["Yes", "No"])).toBe(null);
  });
});
