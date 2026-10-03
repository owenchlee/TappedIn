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

describe("questions seen on live Greenhouse / Ashby / Lever forms (Oct 2026)", () => {
  const combo = { kind: "combobox" as const };
  it("keeps sensitive questions away from both the profile and the model", () => {
    for (const label of [
      "For your most recent degree, what is/was your GPA (normalized to a 4.0 scale)?",
      "EXPORT CONTROLS - This position requires access to information that is subject to U.S. export controls",
      "Employment eligibility status",
      "What are your annualized total compensation expectations?",
    ]) {
      expect(mapField(field(label, combo), profile, files).kind, label).toBe("needs_owen");
    }
  });

  it("doesn't answer yes/no questions or checkboxes with a personal field", () => {
    expect(mapField(field("Will you be returning to school at the end of the internship?", combo), profile, files).kind).toBe("unmapped");
    expect(mapField(field("New York City - 1 World Trade", { kind: "checkbox" }), profile, files).kind).toBe("unmapped");
    expect(mapField(field("What is your top location preference?", combo), profile, files).kind).toBe("unmapped");
    expect(mapField(field("Name Pronunciation | How do you pronounce your name?"), profile, files).kind).toBe("unmapped");
    expect(mapField(field("High School Name", { kind: "textarea" }), profile, files).kind).toBe("unmapped");
  });

  it("still maps the plain fields", () => {
    expect(mapField(field("School", combo), profile, files)).toEqual({ kind: "value", value: "University of Waterloo" });
    expect(mapField(field("Current Location"), profile, files)).toEqual({ kind: "value", value: "Waterloo, Ontario, Canada" });
    expect(mapField(field("What year are you expected to graduate?", combo), profile, files)).toEqual({ kind: "value", value: "2031" });
    const withGh = { ...profile, github: "https://github.com/someone/" };
    expect(mapField(field("What is your Github username?"), withGh, files)).toEqual({ kind: "value", value: "someone" });
    expect(mapField(field("Resume/CV", { kind: "file" }), profile, files)).toEqual({ kind: "value", value: { file: "r.pdf" } });
  });
});
