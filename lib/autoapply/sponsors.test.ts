import { describe, expect, it } from "vitest";
import { knownSponsor, usVisaOk } from "./sponsors";

describe("usVisaOk", () => {
  it("takes a posting that says it sponsors, from anyone", () => {
    expect(usVisaOk("Verkada", "We offer visa sponsorship for this internship.")).toBe(true);
  });
  it("takes a known sponsor that doesn't mention it", () => {
    expect(knownSponsor("NVIDIA")).toBe(true);
    expect(usVisaOk("Google", "Build software at scale.")).toBe(true);
    expect(usVisaOk("Uline", "Build software at scale.")).toBe(false);
  });
  it("never takes no-sponsorship or citizen-only postings", () => {
    expect(usVisaOk("Google", "We are unable to provide visa sponsorship for this role.")).toBe(false);
    expect(usVisaOk("Amazon", "Must be a U.S. citizen.")).toBe(false);
  });
});
