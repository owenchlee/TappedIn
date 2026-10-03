import { DECLINE_RE, bestOption, type FillValue, type FormField } from "./form";

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
  const v = (value: string | boolean | null | undefined): Mapped => {
    // A recognized personal field that's blank in profile.json is Owen's to fill, never the model's.
    if (value === "" || value == null) return { kind: "needs_owen", reason: `"${field.label}" is blank on your Profile page` };
    // A choice question the profile value doesn't fit ("Have you graduated?" vs a graduation date)
    // goes to Claude instead of failing to match at fill time.
    if (typeof value === "string" && field.options?.length && !bestOption(field.options, value)) return { kind: "unmapped" };
    return { kind: "value", value };
  };

  if (field.kind === "file") {
    if (/cover/.test(l)) return files.coverLetter ? { kind: "value", value: { file: files.coverLetter } } : { kind: "unmapped" };
    if (/resume|résumé|cv\b|curriculum/.test(l) || !l) return { kind: "value", value: { file: files.resume } };
    return { kind: "unmapped" };
  }
  if (/cover letter/.test(l) && field.kind === "textarea") {
    return files.coverLetterText ? { kind: "value", value: files.coverLetterText } : { kind: "unmapped" };
  }

  // Sensitive: only ever answered from profile.json, never guessed by the model.
  // The answers differ by country (a Canadian is authorized in Canada, not the US), so a question
  // that doesn't name the country ("...in the country where this job is located?") is Owen's call.
  const namesUs = /\b(us|u\.s\.a?\.?|usa|united states|america)\b/.test(l);
  const namesCanada = /\bcanad/.test(l);
  const sameEverywhere = p.authorizedToWorkInCanada != null && p.authorizedToWorkInCanada === p.authorizedToWorkInUS;
  if (/sponsor|visa/.test(l)) {
    if (p.requiresSponsorship == null) return { kind: "needs_owen", reason: "Sponsorship: answer it on your Profile page" };
    if (!sameEverywhere) return { kind: "needs_owen", reason: "Sponsorship depends on the job's country; answer it yourself" };
    return { kind: "value", value: yesNo(p.requiresSponsorship) };
  }
  if (/authori[sz]|legally (eligible|able|permitted)|eligible to work|right to work|work permit/.test(l)) {
    const which = namesUs && !namesCanada ? "US" : namesCanada && !namesUs ? "Canada" : null;
    const val =
      which === "US" ? p.authorizedToWorkInUS : which === "Canada" ? p.authorizedToWorkInCanada : sameEverywhere ? p.authorizedToWorkInCanada : null;
    if (val != null) return { kind: "value", value: yesNo(val) };
    return {
      kind: "needs_owen",
      reason: which ? `Work authorization (${which}): answer it on your Profile page` : "Work authorization depends on the job's country; answer it yourself",
    };
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
      const opt = field.options?.find((o) => DECLINE_RE.test(o));
      return { kind: "value", value: opt ?? DECLINE };
    }
  }
  // Also Owen's alone, and not in his profile: never handed to the model either.
  const SENSITIVE: [RegExp, string][] = [
    [/citizen|export control|\bitar\b|security clearance|u\.s\. person|eligibility status|immigration|work status/, "Citizenship / export control"],
    [/salary|compensation|pay (expectation|rate|range)|desired (pay|rate|wage)|hourly rate|expected (pay|rate|wage)/, "Pay expectations"],
    [/\bgpa\b|grade point|cumulative average/, "GPA"],
    [/criminal|convict|felony|background check/, "Background check"],
  ];
  for (const [re, what] of SENSITIVE) if (re.test(l)) return { kind: "needs_owen", reason: `${what}: answer it yourself` };

  // Below are personal fields. A checkbox ("New York City - 1 World Trade") or a yes/no question
  // ("Will you be returning to school...?") that mentions one is not asking for that value.
  if (field.kind === "checkbox" || /^(are|do|does|did|have|has|will|would|can|could|is|were)\b/.test(l)) return { kind: "unmapped" };

  // Lever: "Name Pronunciation", "High School Name". Not the name or school the profile holds.
  if (/pronounc|high school|secondary school/.test(l)) return { kind: "unmapped" };
  if (/preferred (first )?name|nickname/.test(l)) return v(p.preferredName);
  if (/first name|given name|legal first/.test(l)) return v(p.firstName);
  if (/last name|family name|surname|legal last/.test(l)) return v(p.lastName);
  if (/^(full )?(legal )?name$|full name|your name/.test(l)) return v(`${p.firstName} ${p.lastName}`);
  if (/e-?mail/.test(l)) return v(p.email);
  if (/phone|mobile|cell/.test(l)) return v(p.phone);
  if (/linkedin/.test(l)) return v(p.linkedin);
  if (/github/.test(l)) return v(/username|handle/.test(l) ? (p.github.replace(/\/+$/, "").split("/").pop() ?? "") : p.github);
  if (/website|portfolio|personal (site|url)|other (link|url)/.test(l)) return v(p.website);
  if (/pronoun/.test(l)) return v(p.pronouns);
  if (/^(school|university|college|institution)( name)?$|(school|university|college|institution) name|name of (your )?(school|university|college|institution)|(which|what|current) (school|university|college|institution)/.test(l))
    return v(p.school);
  if (/degree/.test(l)) return v(p.degree);
  if (/discipline|major|field of study|program of study|program\b/.test(l)) return v(p.program);
  if (/graduat|expected (completion|end)/.test(l)) return v(/\byear\b/.test(l) ? p.graduationDate.slice(0, 4) : monthYear(p.graduationDate));
  if (/postal|zip/.test(l)) return v(p.postalCode);
  if (/address/.test(l)) return v(p.addressLine1);
  if (/\bcity\b/.test(l)) return v(p.city);
  // Not a bare /state/: "Please state why..." is a free-text question, not an address field.
  if (/\bprovince\b|^state\b|\bstate\s*(\/|or)\s*province|\b(home|current) state\b/.test(l)) return v(p.province);
  if (/country/.test(l)) return v(p.country);
  // "Location preference" / "Which office..." asks where he'd work, not where he lives.
  if (/location|where are you (based|located)|current(ly)? (located|residing)/.test(l) && !/prefer|office|which|willing|relocat|hub|site/.test(l))
    return v(`${p.city}, ${p.province}, ${p.country}`);
  if (/how did you (hear|find|learn)|^(application |candidate )?source$|referr(al|ed) by/.test(l)) {
    if (/referr/.test(l)) return { kind: "unmapped" };
    const opt = field.options && (field.options.find((o) => /career|company (web)?site|job (board|posting)/i.test(o)) ?? field.options.find((o) => /other/i.test(o)));
    return v(opt ?? p.howDidYouHear);
  }
  return { kind: "unmapped" };
}
