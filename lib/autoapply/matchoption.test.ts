import { describe, expect, it } from "vitest";
import { matchOption } from "./formfill";

describe("matchOption", () => {
  it("never puts Male on Female", () => {
    expect(matchOption(["Female", "Male", "Non-binary"], "Male")).toBe("Male");
    expect(matchOption(["Female", "Non-binary", "Man"], "Male")).toBe("Man");
    expect(matchOption(["Woman", "Man", "I don't wish to answer"], "Male")).toBe("Man");
    expect(matchOption(["Non-binary", "Transgender/transitioning to male", "Man", "Woman"], "Male")).toBe("Man");
    expect(matchOption(["Transgender/transitioning to male"], "Male")).toBeUndefined();
  });
  it("matches Workday's disability wording", () => {
    expect(matchOption(["Mental Health (Canada)", "No Disability (Canada)", "Prefer Not to Say (Canada)"], "No, I do not have a disability")).toBe("No Disability (Canada)");
  });
  it("maps decline to the site's wording", () => {
    expect(matchOption(["Yes", "No", "I do not wish to self-identify"], "decline")).toBe("I do not wish to self-identify");
  });
  it("still matches by containment", () => {
    expect(matchOption(["Canada (+1)", "United States (+1)"], "Canada")).toBe("Canada (+1)");
    expect(matchOption(["Yes", "No"], "No")).toBe("No");
  });
});
