import { describe, expect, it } from "vitest";
import { bestOption } from "@/lib/autoapply/form";

describe("bestOption", () => {
  it("matches exact, prefix and containment", () => {
    expect(bestOption(["Canada +1", "United States +1"], "Canada")).toBe("Canada +1");
    expect(bestOption(["University of Waterloo", "Wilfrid Laurier University"], "University of Waterloo")).toBe("University of Waterloo");
  });

  it("matches the same answer worded differently (live Greenhouse / Lever options)", () => {
    expect(bestOption(["Male", "Female", "Decline To Self Identify"], "I don't wish to answer")).toBe("Decline To Self Identify");
    expect(bestOption(["Yes, I have a disability", "No, I do not have a disability", "I do not want to answer"], "I don't wish to answer")).toBe(
      "I do not want to answer",
    );
    expect(bestOption(["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree"], "Bachelor of Applied Science (BASc)")).toBe(
      "Bachelor's Degree",
    );
  });

  it("never matches a short option inside a longer answer", () => {
    expect(bestOption(["Yes", "No"], "Systems Design Engineering")).toBeNull();
  });
});

describe("bestOption specificity", () => {
  it("prefers the most specific contained option", () => {
    expect(bestOption(["Engineering", "Systems Design Engineering", "Design"], "Systems Design Engineering (BASc)")).toBe("Systems Design Engineering");
  });

  it("picks the company's own site for 'careers page', not a career fair", () => {
    expect(bestOption(["University Career Fair", "Anduril Website", "LinkedIn", "Other"], "Company careers page")).toBe("Anduril Website");
  });

  it("takes either wording of the same degree level", () => {
    expect(bestOption(["Bachelors", "Bachelor's Degree"], "Bachelor of Applied Science (BASc)")).toBe("Bachelors");
  });

  it("strict mode skips containment", () => {
    expect(bestOption(["Engineering"], "Systems Design Engineering", true)).toBeNull();
  });
});
