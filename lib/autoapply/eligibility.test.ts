import { describe, expect, it } from "vitest";
import { eligibilityWarnings } from "@/lib/autoapply/eligibility";

describe("eligibilityWarnings", () => {
  it("flags U.S. citizenship requirements in their usual phrasings", () => {
    for (const text of [
      "U.S. citizenship is required for this position.",
      "Applicants must be a U.S. citizen.",
      "This role requires US citizenship due to contract terms.",
      "US citizens only.",
    ]) {
      expect(eligibilityWarnings(text)).toContain("Requires U.S. citizenship");
    }
  });

  it("flags security clearance and ITAR", () => {
    expect(eligibilityWarnings("Must be able to obtain a Secret clearance.").join()).toMatch(/clearance/);
    expect(eligibilityWarnings("Active TS/SCI clearance preferred").join()).toMatch(/clearance/);
    expect(eligibilityWarnings("This position is subject to ITAR and requires a U.S. person.").join()).toMatch(/ITAR/);
  });

  it("doesn't flag wording that lets non-citizens in", () => {
    expect(eligibilityWarnings("Applicants must be a U.S. citizen, permanent resident, or otherwise authorized to work in the U.S.")).not.toContain("Requires U.S. citizenship");
    expect(eligibilityWarnings("This role may involve export control (ITAR) information; offers may require an export license for non-U.S. persons.").join()).not.toMatch(/ITAR/);
    // A real ITAR rule elsewhere in the same posting still counts.
    expect(eligibilityWarnings("Work may involve export control matters. Under ITAR, this position is limited to a U.S. person as defined by law, and that is a firm requirement for every hire on this team.").join()).toMatch(/ITAR/);
  });

  it("flags no sponsorship separately", () => {
    expect(eligibilityWarnings("We are unable to sponsor visas for this role.").join()).toMatch(/sponsorship/);
    expect(eligibilityWarnings("Candidates must be authorized to work without sponsorship.").join()).toMatch(/sponsorship/);
  });

  it("says nothing about U.S. rules on a job in Canada", () => {
    // Ovintiv, Calgary: a Canadian needs no sponsorship to work in Canada.
    const ovintiv = "Must be legally eligible to work in Canada for the duration of your work term without sponsorship.";
    expect(eligibilityWarnings(ovintiv, "canada")).toEqual([]);
    expect(eligibilityWarnings(ovintiv)).toEqual([]); // pasted link: guessed from the text
    expect(eligibilityWarnings("We are unable to sponsor visas for this role.", "us").join()).toMatch(/sponsorship/);
  });

  it("stays quiet on normal postings", () => {
    expect(
      eligibilityWarnings(
        "Build React dashboards. We welcome applicants of all backgrounds. Citizens of the world! Clearance sale on swag.",
      ),
    ).toEqual([]);
  });
});
