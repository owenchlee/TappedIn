import { extractRequirements, normalizeText, type Flag, type HardFlag, HARD_FLAGS } from "@/lib/fit/requirements";
import type { JobPrefs } from "@/lib/fit/prefs";
import { termForDate, termShortLabel, termSortKey } from "@/lib/terms";
import { JOB_CATEGORY_LABELS, type JobCategory } from "@/lib/types";

// How well one posting suits you, 0-100, with the reasons. Pure: the refresh, the backfill script
// and the Settings page all run it over every open job.

export type FitInput = {
  role: string;
  terms: string[];
  category: string | null;
  region: string | null;
  postedAt: Date | null;
  firstSeenAt: Date;
  deadline: Date | null;
  details: string | null;
  detailsStatus: string | null;
};

export type Fit = { score: number; reasons: string[]; flags: Flag[] };

const DAY = 86_400_000;
const BASE = 38;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resume skills the posting mentions. Case-sensitive, so "React"/"Express" don't match prose. */
export function matchedSkills(text: string, skills: string[]): string[] {
  return skills.filter((s) => s.length > 1 && new RegExp(`(?<![\\w+#.])${escapeRe(s)}(?![\\w+#])`).test(text));
}

export function isHard(flag: Flag): flag is HardFlag {
  return (HARD_FLAGS as readonly string[]).includes(flag);
}

export function scoreJob(job: FitInput, prefs: JobPrefs, now: Date = new Date()): Fit {
  const text = job.details ? normalizeText(job.details) : null;
  const req = extractRequirements(job.role, text);
  const flags: Flag[] = [];
  const parts: { delta: number; label: string }[] = [];
  const add = (delta: number, label: string) => parts.push({ delta, label });
  const block = (flag: HardFlag, label: string) => {
    flags.push(flag);
    add(-40, label);
  };

  // --- can you apply at all? -------------------------------------------------------------------
  if (job.detailsStatus === "gone") block("gone", "Posting was taken down");
  const current = termSortKey(termForDate(now));
  if (job.terms.length > 0 && job.terms.every((t) => termSortKey(t) < current)) block("past_term", "Term already started");
  const w = req.gradWindow;
  if (w && ((w.max != null && w.max < prefs.gradYear) || (w.min != null && w.min > prefs.gradYear))) {
    const range = w.min != null && w.max != null ? (w.min === w.max ? `${w.min}` : `${w.min}–${w.max}`) : w.max != null ? `by ${w.max}` : `${w.min}+`;
    block("grad_year", `For grads ${range}`);
  }
  if (req.upperYear === "required") block("upper_year", "Upper years only");
  if (req.gradDegreeOnly) block("grad_degree", req.gradDegreeOnly);
  if (req.usCitizenOnly) block("us_citizen", "U.S. citizens only");
  if (req.otherSchool) block("other_school", `${req.otherSchool} students only`);
  if (req.notInternship) block("not_internship", "Not an internship");

  // --- how good a fit -----------------------------------------------------------------------------
  const targets = new Set(prefs.targetTerms);
  const hit = job.terms.find((t) => targets.has(t));
  if (hit) add(15, termShortLabel(hit));
  else if (job.terms.length > 0) add(-12, `Not ${prefs.targetTerms.map(termShortLabel).join(" / ") || "your term"}`);

  const cat = job.category as JobCategory | null;
  if (cat && prefs.categories.includes(cat)) add(prefs.categories[0] === cat ? 12 : 9, JOB_CATEGORY_LABELS[cat]);
  else if (cat === "other" || !cat) add(-10, "Not a tech role");
  else add(-6, JOB_CATEGORY_LABELS[cat]);

  if (job.region === "canada") add(10, "In Canada");
  else if (job.region === "remote") add(6, "Remote");
  else if (job.region === "intl") add(-15, "Outside North America");

  if (req.earlyFriendly) add(12, "Open to 1st/2nd years");
  if (req.coop) add(job.region === "canada" ? 8 : 5, "Co-op friendly");
  if (w && w.max == null && w.min != null && w.min <= prefs.gradYear) add(3, `Grads ${w.min}+`);
  if (req.upperYear === "preferred") {
    flags.push("upper_pref");
    add(-10, "Prefers upper years");
  }
  if (req.noSponsorship && job.region === "us") {
    flags.push("no_sponsorship");
    add(-8, "No visa sponsorship");
  }

  const skills = matchedSkills(`${job.role}\n${text ?? ""}`, prefs.skills);
  if (skills.length) add(Math.min(10, skills.length * 2), skills.slice(0, 3).join(", ") + (skills.length > 3 ? ` +${skills.length - 3}` : ""));

  const posted = job.postedAt && job.postedAt < job.firstSeenAt ? job.postedAt : job.firstSeenAt;
  const age = (now.getTime() - posted.getTime()) / DAY;
  if (age <= 7) add(4, "Posted this week");
  else if (age > 60) add(-4, "Posted 2+ months ago");
  if (job.deadline) {
    const left = (job.deadline.getTime() - now.getTime()) / DAY;
    if (left >= 0 && left <= 10) add(3, "Deadline soon");
  }

  if (!text && job.detailsStatus && job.detailsStatus !== "gone") {
    flags.push("unreadable");
    add(-3, "Couldn't read the posting");
  }

  // A plain posting for your term and field lands around 65; 100 takes nearly every bonus at once.
  const score = Math.max(0, Math.min(100, Math.round(BASE + parts.reduce((s, p) => s + p.delta, 0))));
  // Blockers first, then the biggest effects either way.
  const reasons = parts
    .sort((a, b) => (a.delta === -40 ? -1 : 0) - (b.delta === -40 ? -1 : 0) || Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6)
    .map((p) => `${p.delta >= 0 ? "+" : "-"}${p.label}`);
  return { score, reasons, flags };
}
