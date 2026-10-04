import { describe, expect, it } from "vitest";
import { extractRequirements, gradWindow, sponsorship, termsInText, upperYear } from "@/lib/fit/requirements";
import { postingTerms } from "@/lib/sources/enrich";

describe("terms", () => {
  const sept = new Date("2026-09-22T00:00:00Z");
  it("drops terms that were over before the job was posted", () => {
    // SimplifyJobs tags September 2026 postings "Winter 2026".
    expect(postingTerms(["W26"], "Software Engineering Intern", sept)).toEqual([]);
    expect(postingTerms(["W26", "S27"], "Software Engineering Intern", sept)).toEqual(["S27"]);
    // A Summer 2026 posting from February really was for Summer 2026.
    expect(postingTerms(["S26"], "Intern", new Date("2026-02-07T00:00:00Z"))).toEqual(["S26"]);
  });
  it("falls back to the title, with the same check", () => {
    expect(postingTerms([], "Software Developer Co-op (Winter 2027)", sept)).toEqual(["W27"]);
    expect(postingTerms([], "Software/Application Developer Co-op (Winter 2026)", sept)).toEqual([]);
  });
  it("reads the internship's own term from the posting text, not graduation dates", () => {
    expect(termsInText("SPRING 2027 SOFTWARE ENGINEERING INTERNSHIP/CO-OP\nExpected graduation date of Fall 2025 or later")).toEqual(["W27"]);
    expect(termsInText("We're hiring for the Summer 2027 term.")).toEqual(["S27"]);
    expect(termsInText("Founded in 2019, we serve customers in 40 countries.")).toEqual([]);
  });
});

// Sentences copied from real Summer 2027 postings (Oct 2026).
describe("gradWindow", () => {
  it.each([
    ["• Graduation date between December 2027 and June 2028", { min: 2027, max: 2028 }],
    ["Expected graduation date of 2027 or 2028", { min: 2027, max: 2028 }],
    ["graduating December 2027 or later", { min: 2027, max: null }],
    ["Expected graduation date is December 2027 or beyond", { min: 2027, max: null }],
    ["Expected graduation date no later then December 2028", { min: null, max: 2028 }],
    ["Graduation date cannot be prior to August 13, 2027", { min: 2027, max: null }],
    ["Pursuing a degree in Computer Science or a related field (graduating 2026-2028).", { min: 2026, max: 2028 }],
  ])("%s", (text, want) => {
    expect(gradWindow(text)).toEqual(want);
  });

  it("widens across several sentences (junior and sophomore classes)", () => {
    expect(gradWindow("A current junior (graduation date of December 2027 or May 2028) or current sophomore (graduation date of December 2028 or May 2029)")).toEqual({
      min: 2027,
      max: 2029,
    });
  });

  it("ignores graduation that isn't about the applicant's date", () => {
    expect(gradWindow("If you are starting a graduate degree program in Spring 2027 you must apply for the Graduate position.")).toBeNull();
    expect(gradWindow("Remove age-identifying information such as dates of school attendance or graduation in 2019.")).toBeNull();
    expect(gradWindow("A $10,000 bonus upon graduation and converting to full-time in 2028.")).toBeNull();
    // RBC co-ops: an exception for students in their last term, not a requirement.
    expect(gradWindow("are graduating in April 2027/August 2027), but you require the work term as a mandatory component in order to graduate successfully.")).toBeNull();
  });
});

describe("upperYear", () => {
  it.each([
    "• Pursuing a bachelor's degree; rising senior with a major in computer science",
    "You're in your penultimate or final year of an undergraduate degree in Computer Science",
    "• Junior or Senior pursuing a Bachelor's or Master's or PhD degree in computer science/engineering",
    "• If pursuing a bachelor's degree, completion of at least sophomore year (60 or more credit hours)",
    "Pursuing an Engineering degree in ME, EE or IE, sophomore classes completed.",
    "• Currently enrolled as a BS 3rd or 4th-year student or Master student in Electrical Engineering",
    "This should be your final internship before graduating",
  ])("upper years required: %s", (text) => {
    expect(upperYear(text).upperYear).toBe("required");
  });

  it("is only a preference when the posting says so", () => {
    expect(upperYear("• Junior or Senior classification preferred").upperYear).toBe("preferred");
  });

  it.each([
    "currently be an undergraduate student working on their bachelor's degree in their freshman, sophomore, or junior year",
    "• Prefer rising sophomores and juniors with an anticipated graduation date between May 2028 or later",
    "- Current student, Freshman or higher (as of Fall 2027)",
  ])("welcomes early students: %s", (text) => {
    const r = upperYear(text);
    expect(r.earlyFriendly).toBe(true);
    expect(r.upperYear).toBeNull();
  });

  it("doesn't read colleagues as a seniority requirement", () => {
    expect(upperYear("• Work closely with senior engineers and senior leaders on hard problems").upperYear).toBeNull();
    expect(upperYear("There is significant, on-going contact between senior and junior staff.").upperYear).toBeNull();
  });

  it("counts 'second or third year' as open to early students", () => {
    const r = upperYear("Currently enrolled in your second or third year of a related discipline such as business");
    expect(r.upperYear).toBeNull();
    expect(r.earlyFriendly).toBe(true);
  });

  it("doesn't read a customer's first year as an early-student signal", () => {
    expect(upperYear("The median customer saves 5% in their first year.").earlyFriendly).toBe(false);
  });
});

describe("extractRequirements", () => {
  it("spots PhD- and grad-only roles from the title or the text", () => {
    expect(extractRequirements("Hardware Engineer Intern - PhD", null).gradDegreeOnly).toBe("PhD students only");
    expect(extractRequirements("2027 MBA Intern - Product Manager", null).gradDegreeOnly).toBe("MBA students only");
    expect(extractRequirements("Software Engineering Intern - Masters", null).gradDegreeOnly).toBe("Grad students only");
    expect(extractRequirements("Data Scientist Intern", "• Must be enrolled in a PhD program").gradDegreeOnly).toBe("PhD students only");
  });

  it("keeps roles open to bachelor's students", () => {
    expect(extractRequirements("IC Validation Engineer Intern Co-op, BS/MS", null).gradDegreeOnly).toBeNull();
    expect(extractRequirements("Engineer Intern", "Junior or Senior pursuing a Bachelor’s or Master's or PhD degree").gradDegreeOnly).toBeNull();
    expect(extractRequirements("Product Intern", "- Currently pursuing a Bachelor’s or Master's degree in Computer Science").gradDegreeOnly).toBeNull();
  });

  it("flags single-school programs", () => {
    const r = extractRequirements(
      "Data Engineer Intern",
      "Individuals who are currently enrolled at the University of Illinois Urbana Champaign working towards a Bachelor's degree are encouraged to apply.",
    );
    expect(r.otherSchool).toBe("University of Illinois Urbana Champaign");
    expect(extractRequirements("Intern", "Must be a student at an accredited university.").otherSchool).toBeNull();
  });

  it("reads U.S. citizenship and sponsorship rules", () => {
    expect(extractRequirements("SWE Intern", "Applicants must be a U.S. citizen due to contract requirements.").usCitizenOnly).toBe(true);
    expect(extractRequirements("SWE Intern", "This role requires an active Secret clearance.").usCitizenOnly).toBe(true);
    expect(extractRequirements("SWE Intern", "We will not sponsor visas for this position.").noSponsorship).toBe(true);
    expect(extractRequirements("SWE Intern", "Visa sponsorship is available for this position.").sponsors).toBe(true);
  });

  // Sentences from real postings.
  it.each([
    ["Relocation: No relocation\nVISA Sponsorship:\nNo\nTravel Requirements: No Travel Required", "no"],
    ["Relocation: Not eligible Is Sponsorship Available? No Flex is an Equal Opportunity Employer", "no"],
    ["Vanguard is not offering sponsorship for this position", "no"],
    ["This is not a position for which sponsorship will be provided.", "no"],
    ["Must not require visa sponsorship or have work authorization based on OPT or CPT", "no"],
    ["No OPT, CPT, STEM/OPT or visa sponsorship now or in future.", "no"],
    ["If you need immigration sponsorship for your employment, we recommend that you consult with your private immigration attorney.", null],
    ["Relocation:\nVISA Sponsorship:\nTravel Requirements:", null],
    ["If applicable, Kodiak may provide visa sponsorship for eligible candidates.", "yes"],
    ["We do sponsor and take over sponsorship of employment visas for this role.", "yes"],
    ["Paid Time Off\n- Visa Sponsorship\n- Medical, Dental, and Vision insurance", "yes"],
    ["Competitive salary and benefits package, with J-1 and F-1 visa sponsorship available.", "yes"],
    ["Housing including up to 2 pieces of luggage, and handle your J-1 visa sponsorship.", "yes"],
    ["The company will offer immigration sponsorship for this position, if needed.", "yes"],
  ] as const)("reads sponsorship: %s", (text, want) => {
    expect(sponsorship(text)).toBe(want);
  });

  it("recognises co-ops and new-grad roles", () => {
    expect(extractRequirements("Software Engineer Co-op, Backend", null).coop).toBe(true);
    expect(extractRequirements("SDE Intern", "- 3-4 month internship (starts January 2027, May 2027)").coop).toBe(true);
    expect(extractRequirements("Forward Deployed Software Engineer, New Grad - Commercial", null).notInternship).toBe(true);
    expect(extractRequirements("New Grad Intern Program", null).notInternship).toBe(false);
  });
});
