import type { FillValue, FormField } from "./form";

export type Profile = {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  addressLine1: string;
  linkedin: string;
  github: string;
  website: string;
  school: string;
  degree: string;
  program: string;
  startDate: string;
  graduationDate: string;
  currentTerm: string;
  authorizedToWorkInCanada: boolean | null;
  authorizedToWorkInUS: boolean | null;
  requiresSponsorship: boolean | null;
  gender: string;
  race: string;
  veteranStatus: string;
  disabilityStatus: string;
  pronouns: string;
  howDidYouHear: string;
};

export type Mapped =
  | { kind: "value"; value: FillValue }
  | { kind: "needs_owen"; reason: string } // sensitive and not set in profile.json
  | { kind: "unmapped" }; // hand to Claude

const DECLINE = "I don't wish to answer";
const yesNo = (b: boolean) => (b ? "Yes" : "No");

function monthYear(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y) return "";
  const month = m ? new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }) : "";
  return month ? `${month} ${y}` : String(y);
}

/**
 * Deterministic answers for the questions every ATS asks. Order matters: more specific patterns
 * (e.g. "preferred first name") come before general ones ("first name").
 */
export function mapField(
  field: FormField,
  p: Profile,
  files: { resume: string; coverLetter?: string; coverLetterText?: string },
): Mapped {
  const l = field.label.toLowerCase();
  const v = (value: string | boolean | null | undefined): Mapped =>
    // A recognized personal field that's blank in profile.json is Owen's to fill, never the model's.
    value === "" || value == null
      ? { kind: "needs_owen", reason: `"${field.label}" is blank in private/profile.json` }
      : { kind: "value", value };

  if (field.kind === "file") {
    if (/cover/.test(l)) return files.coverLetter ? { kind: "value", value: { file: files.coverLetter } } : { kind: "unmapped" };
    if (/resume|résumé|cv\b|curriculum/.test(l) || !l) return { kind: "value", value: { file: files.resume } };
    return { kind: "unmapped" };
  }
  if (/cover letter/.test(l) && field.kind === "textarea") {
    return files.coverLetterText ? { kind: "value", value: files.coverLetterText } : { kind: "unmapped" };
  }

  // Sensitive: only ever answered from profile.json, never guessed by the model.
  if (/sponsor|visa/.test(l)) {
    return p.requiresSponsorship == null
      ? { kind: "needs_owen", reason: "sponsorship: set requiresSponsorship in private/profile.json" }
      : { kind: "value", value: yesNo(p.requiresSponsorship) };
  }
  if (/authori[sz]|legally (eligible|able|permitted)|eligible to work|right to work|work permit/.test(l)) {
    const us = /\b(us|u\.s\.|united states|america)\b/.test(l);
    const val = us ? p.authorizedToWorkInUS : p.authorizedToWorkInCanada;
    return val == null
      ? { kind: "needs_owen", reason: `work authorization (${us ? "US" : "Canada"}): set it in private/profile.json` }
      : { kind: "value", value: yesNo(val) };
  }
  const eeo: [RegExp, string][] = [
    [/gender|sex\b/, p.gender],
    [/race|ethnic|hispanic|latino/, p.race],
    [/veteran/, p.veteranStatus],
    [/disabilit/, p.disabilityStatus],
  ];
  for (const [re, pref] of eeo) {
    if (re.test(l)) {
      if (pref !== "decline") return v(pref);
      const opt = field.options?.find((o) => /decline|don.?t wish|prefer not|not to (say|answer|disclose|self)|choose not/i.test(o));
      return { kind: "value", value: opt ?? DECLINE };
    }
  }

  if (/preferred (first )?name|nickname/.test(l)) return v(p.preferredName);
  if (/first name|given name|legal first/.test(l)) return v(p.firstName);
  if (/last name|family name|surname|legal last/.test(l)) return v(p.lastName);
  if (/^(full )?(legal )?name$|full name|your name/.test(l)) return v(`${p.firstName} ${p.lastName}`);
  if (/e-?mail/.test(l)) return v(p.email);
  if (/phone|mobile|cell/.test(l)) return v(p.phone);
  if (/linkedin/.test(l)) return v(p.linkedin);
  if (/github/.test(l)) return v(p.github);
  if (/website|portfolio|personal (site|url)|other (link|url)/.test(l)) return v(p.website);
  if (/pronoun/.test(l)) return v(p.pronouns);
  if (/school|university|college|institution/.test(l)) return v(p.school);
  if (/degree/.test(l)) return v(p.degree);
  if (/discipline|major|field of study|program of study|program\b/.test(l)) return v(p.program);
  if (/graduat|expected (completion|end)/.test(l)) return v(monthYear(p.graduationDate));
  if (/postal|zip/.test(l)) return v(p.postalCode);
  if (/address/.test(l)) return v(p.addressLine1);
  if (/\bcity\b/.test(l)) return v(p.city);
  if (/province|state\b/.test(l)) return v(p.province);
  if (/country/.test(l)) return v(p.country);
  if (/location|where are you (based|located)|current(ly)? (located|residing)/.test(l)) return v(`${p.city}, ${p.province}, ${p.country}`);
  if (/how did you (hear|find|learn)|^(application |candidate )?source$|referr(al|ed) by/.test(l)) {
    if (/referr/.test(l)) return { kind: "unmapped" };
    const opt = field.options && (field.options.find((o) => /career|company (web)?site|job (board|posting)/i.test(o)) ?? field.options.find((o) => /other/i.test(o)));
    return v(opt ?? p.howDidYouHear);
  }
  return { kind: "unmapped" };
}
