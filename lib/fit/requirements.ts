import { termsFromText } from "@/lib/terms";

// Who a posting is for, read from its title and text. Pure, so every rule is unit-tested against
// sentences taken from real postings (lib/fit/requirements.test.ts).

/** Codes stored in CoopPosting.flags. Hard ones mean you can't apply; they're hidden by default. */
export const HARD_FLAGS = ["grad_year", "upper_year", "grad_degree", "us_citizen", "other_school", "not_internship", "past_term", "gone"] as const;
export const SOFT_FLAGS = ["upper_pref", "no_sponsorship", "unreadable"] as const;
export type HardFlag = (typeof HARD_FLAGS)[number];
export type SoftFlag = (typeof SOFT_FLAGS)[number];
export type Flag = HardFlag | SoftFlag;

export type Requirements = {
  /** Graduation years the posting accepts, inclusive; null bound = open-ended. */
  gradWindow: { min: number | null; max: number | null } | null;
  /** Wants juniors/seniors (or 2+ completed years): hard when required, soft when only preferred. */
  upperYear: "required" | "preferred" | null;
  /** Open to first- and second-year students, or says no experience is needed. */
  earlyFriendly: boolean;
  /** PhD-, Master's- or MBA-only, as a label ("PhD students only"). */
  gradDegreeOnly: string | null;
  usCitizenOnly: boolean;
  noSponsorship: boolean;
  /** Only students of one named school ("University of Illinois Urbana Champaign"). */
  otherSchool: string | null;
  /** A co-op, or written for co-op students (4/8/12-month terms, "registered co-op program"). */
  coop: boolean;
  /** New-grad / full-time role that slipped into an internship list. */
  notInternship: boolean;
};

const YEAR = /\b(20[2-3]\d)\b/g;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+|•/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Sentences that mention graduation without being about the applicant's graduation date.
// RBC's co-ops: "(i.e. you are graduating in April 2027), but you require the work term as a
// mandatory component in order to graduate" is an exception for final-term students, not a rule.
const GRAD_NOISE =
  /\b(age-identifying|dates? of (school )?attendance|(after|upon|post-?|following|at) graduation|return full[- ]time|full[- ]time (role|offer|employment|position)|mandatory component|in order to graduate|if you|unless|final (work )?term)\b/i;
// The applicant's own graduation ("graduating", "graduation date", "will graduate by"), not "a
// graduate degree program" or "our graduate programme".
const GRAD_DATE = /\bgraduat(ing|ion)\b|\bgraduates? (in|by|between|before|no later)\b|\bwill graduate\b|\bclass of\b/i;

/** The graduation window in a posting, e.g. "Graduation date between December 2027 and June 2028". */
export function gradWindow(text: string): Requirements["gradWindow"] {
  let found: Requirements["gradWindow"] = null;
  for (const s of sentences(text)) {
    if (!GRAD_DATE.test(s) || GRAD_NOISE.test(s)) continue;
    const years = [...s.matchAll(YEAR)].map((m) => Number(m[1]));
    if (years.length === 0) continue;
    const lo = Math.min(...years);
    const hi = Math.max(...years);
    let w: { min: number | null; max: number | null };
    if (/\b(cannot|can't|must not|may not|not) be (prior to|before|earlier than)\b|\b(or later|or after|and later|or beyond|and beyond|no earlier than|at least|onwards?)\b/i.test(s)) w = { min: lo, max: null };
    else if (/\b(no later th[ae]n|or earlier|or before|by|before|prior to)\b\s+(\w+\s+)?20[2-3]\d/i.test(s)) w = { min: null, max: hi };
    else w = { min: lo, max: hi };
    // Several sentences (junior: 2027/28, sophomore: 2028/29) widen the window rather than replace it.
    found = found
      ? { min: found.min == null || w.min == null ? null : Math.min(found.min, w.min), max: found.max == null || w.max == null ? null : Math.max(found.max, w.max) }
      : w;
  }
  return found;
}

// A first- or second-year student is explicitly welcome. "Completed sophomore year" is the opposite.
const EARLY =
  /\b(freshm[ae]n|first[- ]years\b|(first|1st|second|2nd)( or (second|2nd|third|3rd))?[- ]year (students?|of (a|an|your|their)\b|undergrad\w*|university|college|engineering|of (university|college|study|your degree))|rising sophomores?|sophomores?|any year of (study|school)|all years of (study|school)|all class years|no (prior |previous )?(work |internship )?experience (is )?(required|necessary|needed)|early in (your|their) (degree|studies|academic))\b/i;
const EARLY_NEGATED = /\b(complet(ed|ion of|e)|finished|beyond|after)\b[^.]{0,30}\b(sophomore|second|2nd)\b|\b(sophomore|second[- ]year|2nd[- ]year)\b[^.]{0,20}\b(completed|or (greater|higher|above))\b/i;

// Upper-year only: rising juniors/seniors, penultimate/final year, 3rd/4th-year, 2+ years completed.
const UPPER =
  /\b(rising (juniors?|seniors?)|(juniors?|seniors?) (or|and|\/) (juniors?|seniors?)(?! (staff|team|employees|engineers|developers|level|roles?|members|consultants|colleagues))|(juniors?|seniors?) (standing|classification|year)|(penultimate|final)[- ](or final[- ])?year|(3rd|third|4th|fourth)[- ](or (4th|fourth)[- ])?year (undergraduate |bs |bachelor'?s )?(students?|of)|(complet(ed|ion of)|finished) (at least |their |your |the )?(sophomore|second|2nd|two|2) (year|years)|sophomore (year |classes )?(completed|or (greater|higher|above))|entering (their|your) (junior|senior)|(junior|senior) or (graduate|master'?s)|final internship before graduat\w*)\b/i;
const PREFERRED = /\b(prefer(red|ably|ence)?|ideally|a plus|bonus|nice to have)\b/i;
// "senior" in "senior engineer / senior leaders / senior design" is about colleagues, not you.
const SENIOR_NOISE = /\bsenior (engineers?|leaders?|leadership|developers?|staff|team|mentors?|design|management|members?|employees?|scientists?|validation|software)\b/i;

export function upperYear(text: string): { upperYear: Requirements["upperYear"]; earlyFriendly: boolean } {
  let upper: Requirements["upperYear"] = null;
  let early = false;
  for (const s of sentences(text)) {
    const welcomesEarly = EARLY.test(s) && !EARLY_NEGATED.test(s);
    if (welcomesEarly) early = true;
    const cleaned = s.replace(SENIOR_NOISE, "");
    if (!UPPER.test(cleaned) || welcomesEarly) continue;
    const level = PREFERRED.test(s) ? "preferred" : "required";
    if (level === "required" || upper == null) upper = level;
  }
  return { upperYear: upper, earlyFriendly: early };
}

const UNDERGRAD = /\b(undergrad(uate)?s?|bachelor'?s|bachelors|b\.?s\.?c?|b\.?a\.?sc|b\.?eng|college students?|diploma)\b/i;

export function gradDegreeOnly(title: string, text: string): string | null {
  const t = title.toLowerCase();
  if (/\b(bachelor'?s|undergrad(uate)?)\b/.test(t)) return null;
  if (/\bmba\b/.test(t)) return "MBA students only";
  if (/\bph\.?\s?d\b|\bdoctoral\b/.test(t)) return "PhD students only";
  if (/\b(bs|b\.s\.?|bsc)\b/.test(t)) return null;
  if (/\b(master'?s|ms|msc)\b(?! (or|\/))/.test(t) || /\bintern(ship)?\W+graduate\b|\bgraduate (level |student )?(intern|co-?op)/.test(t)) return "Grad students only";
  if (!text || UNDERGRAD.test(text)) return null;
  if (/\b(enrolled in|pursuing|candidates? (for|in)|students? in)\b[^.]{0,40}\bph\.?\s?d\b/i.test(text)) return "PhD students only";
  if (/\b(enrolled in|pursuing)\b[^.]{0,40}\b(graduate degree|master'?s (degree|program))\b/i.test(text)) return "Grad students only";
  return null;
}

// "currently enrolled at the University of Illinois Urbana Champaign" / "a student at UT Austin".
const SCHOOL_ONLY = /\b(?:enrolled|students?|attending)\s+(?:at|in)\s+(the\s+)?((?:University of|[A-Z][A-Za-z&.]+ (?:University|College|Institute))[A-Z][\w&.' -]{0,60}|University of [A-Z][\w&.' -]{2,60})/;

export function otherSchool(text: string): string | null {
  const m = SCHOOL_ONLY.exec(text);
  if (!m) return null;
  const name = m[2].replace(/\s+(working|pursuing|enrolled|and|who|with|in|for)\b.*$/i, "").trim();
  if (/waterloo/i.test(name) || /\b(accredited|a four-year|an? )\b/i.test(name)) return null;
  return name;
}

const US_CITIZEN = [
  /\b(u\.?\s?s\.?|united states)\s+citizen(ship)?\b[^.\n]{0,60}\b(required|is required|must|only)\b|\bmust be (a )?(u\.?\s?s\.?|united states) citizen\b|\brequires? (u\.?\s?s\.?|united states) citizenship\b|\b(u\.?\s?s\.?|united states) citizens? only\b/i,
  /\b(active |current |obtain (a|an)? ?|eligib(le|ility) (for|to obtain) (a|an)? ?)(u\.?\s?s\.? )?(government |security |secret |top secret |ts\/sci )+clearance\b|\b(secret|top secret|ts\/sci) clearance\b/i,
  /\b(itar|export control)\b[^.\n]{0,120}\b(u\.?\s?s\.? person|citizen|permanent resident)/i,
];
const NO_SPONSOR = /\b(will not|cannot|does not|unable to|no) (provide |offer )?(visa )?sponsor(ship)?\b|\bwithout (the need for )?(current or future )?(visa )?sponsorship\b/i;

const COOP = /\bco-?op\b|\b(4|four|8|eight|12|twelve|16|sixteen)[- ]month\b|\bregistered (in a )?co-?op\b|\bwaterloo\b/i;
const NOT_INTERNSHIP = /\b(new grad(uate)?s?|entry[- ]level|graduate (program(me)?|scheme)|full[- ]time (role|position)|early career program)\b(?![^()]*intern)/i;

/**
 * Terms the posting text names for the internship itself ("SPRING 2027 SOFTWARE ENGINEERING
 * INTERNSHIP", "We're hiring for the Summer 2027 term"), ignoring graduation dates.
 */
export function termsInText(text: string): string[] {
  const out = new Set<string>();
  for (const s of sentences(text)) {
    if (!/\b(intern(ship)?s?|co-?ops?|term|program|cohort|start(s|ing)?)\b/i.test(s) || /\bgraduat/i.test(s)) continue;
    for (const t of termsFromText(s)) out.add(t);
  }
  return [...out];
}

/** Curly quotes and dashes defeat "bachelor's" / "2027-2028" patterns; fold them first. */
export function normalizeText(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/[–—]/g, "-");
}

export function extractRequirements(rawTitle: string, rawText: string | null): Requirements {
  const title = normalizeText(rawTitle);
  const body = normalizeText(rawText ?? "");
  const all = `${title}\n${body}`;
  const { upperYear: upper, earlyFriendly } = upperYear(all);
  return {
    gradWindow: gradWindow(all),
    upperYear: upper,
    earlyFriendly,
    gradDegreeOnly: gradDegreeOnly(title, body),
    usCitizenOnly: US_CITIZEN.some((re) => re.test(all)),
    noSponsorship: NO_SPONSOR.test(all),
    otherSchool: body ? otherSchool(body) : null,
    coop: COOP.test(title) || /\b(registered|enrolled) in (a |an )?(\w+ )?co-?op\b|\bco-?op (program|students?|term|placement)\b|\b(4|four|8|eight)[- ]month\b/i.test(body),
    notInternship: !/\b(intern(ship)?|co-?op|student|summer analyst)\b/i.test(title) && NOT_INTERNSHIP.test(title),
  };
}
