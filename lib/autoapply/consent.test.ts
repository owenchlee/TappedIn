import { describe, expect, it } from "vitest";
import { isConsent } from "./scriptfill";

describe("isConsent", () => {
  it("ticks terms, privacy, background checks and truthfulness", () => {
    expect(isConsent("I have read and agree to the Terms and Conditions")).toBe(true);
    expect(isConsent("I consent to the processing of my personal data per the Privacy Policy")).toBe(true);
    expect(isConsent("I authorize Acme to conduct a background check")).toBe(true);
    expect(isConsent("I certify that the information provided is true and complete")).toBe(true);
  });
  it("leaves opt-ins and claims about Owen alone", () => {
    expect(isConsent("Yes, send me text messages about this application")).toBe(false);
    expect(isConsent("Join our talent community for future opportunities")).toBe(false);
    expect(isConsent("I am legally authorized to work in the United States")).toBe(false);
    expect(isConsent("I have a degree in Computer Science")).toBe(false);
    expect(isConsent("")).toBe(false);
  });
});
