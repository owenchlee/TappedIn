import { describe, expect, it } from "vitest";
import { baseFromTitle, parseBaseLine, parseWhyLine } from "./base";

describe("baseFromTitle", () => {
  it.each([
    ["Product Manager Intern", "pm"],
    ["Associate Product Manager (Co-op)", "pm"],
    ["Hardware Product Manager", "pm"],
    ["Technical Program Manager Intern", "pm"],
    ["Product Analyst Co-op", "pm"],
    ["Embedded Firmware Intern", "hardware"],
    ["Electrical Engineering Co-op", "hardware"],
    ["PCB Design Intern", "hardware"],
    ["Software Engineer, Product", "software"],
    ["Full Stack Developer Co-op", "software"],
    ["Machine Learning Intern", "software"],
  ])("%s -> %s", (title, base) => {
    expect(baseFromTitle(title)).toBe(base);
  });

  it("returns null when the title is too vague to judge", () => {
    expect(baseFromTitle("Co-op Student")).toBeNull();
    expect(baseFromTitle("Summer Intern")).toBeNull();
  });
});

describe("notes parsing", () => {
  const notes = "Base: pm\nWhy: The role is an APM internship focused on user research.\n\nChanges...";
  it("reads the base and the reason", () => {
    expect(parseBaseLine(notes)).toBe("pm");
    expect(parseWhyLine(notes)).toBe("The role is an APM internship focused on user research.");
  });
  it("returns null for a missing or unknown base", () => {
    expect(parseBaseLine("Base: marketing")).toBeNull();
    expect(parseBaseLine("no header")).toBeNull();
  });
});
