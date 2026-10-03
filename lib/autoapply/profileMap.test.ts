import { describe, expect, it } from "vitest";
import { mapField, type Profile } from "@/lib/autoapply/profileMap";
import type { FormField } from "@/lib/autoapply/form";

const profile: Profile = {
  firstName: "Test",
  lastName: "Person",
  preferredName: "Test",
  email: "test@example.com",
  phone: "555-0100",
  city: "Waterloo",
  province: "Ontario",
  country: "Canada",
  postalCode: "",
  addressLine1: "",
  linkedin: "",
  github: "",
  website: "",
  school: "University of Waterloo",
  degree: "BASc",
  program: "Systems Design Engineering",
  startDate: "2026-09",
  graduationDate: "2031-06",
  currentTerm: "1A",
  authorizedToWorkInCanada: true,
  authorizedToWorkInUS: false,
  requiresSponsorship: false,
  gender: "decline",
  race: "decline",
  veteranStatus: "decline",
  disabilityStatus: "decline",
  pronouns: "",
  howDidYouHear: "Company careers page",
};

const files = { resume: "r.pdf" };
const field = (label: string, extra: Partial<FormField> = {}): FormField => ({ key: "k", frame: 0, kind: "text", label, required: false, ...extra });
const yn = { kind: "radio" as const, options: ["Yes", "No"] };

describe("work authorization", () => {
  it("answers when the question names the country", () => {
    expect(mapField(field("Are you legally authorized to work in Canada?", yn), profile, files)).toEqual({ kind: "value", value: "Yes" });
    expect(mapField(field("Are you authorized to work in the United States?", yn), profile, files)).toEqual({ kind: "value", value: "No" });
  });

  it("leaves it to Owen when the country isn't named and the answers differ", () => {
    const m = mapField(field("Are you legally authorized to work in the country in which this job is located?", yn), profile, files);
    expect(m.kind).toBe("needs_owen");
  });

  it("never answers sponsorship with one value for every country", () => {
    expect(mapField(field("Will you now or in the future require visa sponsorship?", yn), profile, files).kind).toBe("needs_owen");
    const everywhere = { ...profile, authorizedToWorkInUS: true };
    expect(mapField(field("Will you require sponsorship?", yn), everywhere, files)).toEqual({ kind: "value", value: "No" });
  });
});

describe("other fields", () => {
  it("doesn't treat 'Please state...' as the province", () => {
    expect(mapField(field("Please state why you want to join", { kind: "textarea" }), profile, files).kind).toBe("unmapped");
    expect(mapField(field("State/Province"), profile, files)).toEqual({ kind: "value", value: "Ontario" });
    expect(mapField(field("Province"), profile, files)).toEqual({ kind: "value", value: "Ontario" });
  });

  it("hands choice questions the profile value can't answer to Claude", () => {
    expect(mapField(field("Have you graduated?", yn), profile, files).kind).toBe("unmapped");
    expect(mapField(field("School", { kind: "select", options: ["University of Waterloo", "Other"] }), profile, files)).toEqual({
      kind: "value",
      value: "University of Waterloo",
    });
  });

  it("declines EEO questions using the form's own wording", () => {
    const m = mapField(field("Gender", { kind: "select", options: ["Male", "Female", "Decline to self-identify"] }), profile, files);
    expect(m).toEqual({ kind: "value", value: "Decline to self-identify" });
  });
});
