import { HARD_FLAGS } from "@/lib/fit/requirements";
import { bigCompany, unrealisticTitle } from "./queue";

// Return on an application for a first-year with no work experience: roughly, the odds this one
// turns into an interview. Pure, so the queue page and the tests agree. The weights follow what
// hiring data says moves those odds:
//  - Timing. Recruiters screen in arrival order and stop once they have enough: TalentWorks found
//    interview odds several times higher in a posting's first ~4 days, falling ~28% a day after.
//  - Competition. Big-tech internships draw thousands of applicants (Handshake: 247 per tech
//    internship on average, and far more at household names), with acceptance well under 5%.
//  - Who it's for. A posting open to 1st/2nd years (or a co-op) is the only kind where a first-year
//    isn't competing with juniors who already have an internship.
//  - Fit. Keyword overlap with the resume gets past the ATS screen.
//  - Eligibility. Canada is a straight yes; U.S. roles need a sponsored visa, which most won't do.
// The score drops every day a job waits, so the queue re-sorts itself toward what's fresh.

const DAY = 86_400_000;

export type RoiInput = {
  company: string;
  role: string;
  region?: string | null;
  fitScore?: number | null;
  fitReasons?: string[];
  flags?: string[];
  warnings?: string[];
  /** When the posting went up (the list's date, or when we first saw it); null when unknown. */
  postedAt: Date | null;
  /** When the job was tailored: the posting is at least this old when its own date is unknown. */
  foundAt?: Date;
};

export type RoiPart = { label: string; points: number; max: number };
export type Roi = { score: number; parts: RoiPart[] };

export function roiScore(job: RoiInput, now = new Date()): Roi {
  const reasons = job.fitReasons ?? [];
  const flags = job.flags ?? [];
  const parts: RoiPart[] = [];

  // Timing (30): full marks for the first 4 days, then -28% a day. With no posting date, it's at
  // least as old as the night it was tailored, and probably a few days older.
  const since = job.postedAt ?? job.foundAt;
  const age = since ? Math.max(0, (now.getTime() - since.getTime()) / DAY) + (job.postedAt ? 0 : 3) : null;
  const fresh = age == null ? 12 : age <= 4 ? 30 : 30 * 0.72 ** (age - 4);
  const ageLabel = age == null ? "Posting date unknown" : !job.postedAt ? `Found ${Math.floor(age - 3)}d ago` : age < 1 ? "Posted today" : `Posted ${Math.floor(age)}d ago`;
  parts.push({ label: ageLabel, points: fresh, max: 30 });

  // Competition (25): household names are long shots, everyone else is a normal pool.
  const big = bigCompany(job.company);
  parts.push({ label: big ? "Household name: thousands apply" : "Smaller applicant pool", points: big ? 3 : 25, max: 25 });

  // Who it's for (20).
  const early = reasons.includes("+Open to 1st/2nd years");
  const coop = reasons.includes("+Co-op friendly") || /\bco-?op\b|\bstudent\b/i.test(job.role);
  const upper = flags.includes("upper_pref") || reasons.includes("-Prefers upper years");
  // "Product Manager Intern" is an ordinary internship, not a manager role.
  const senior = unrealisticTitle(job.role.replace(/\b(associate )?product manag(er|ement)\b/gi, "PM"));
  const level = senior ? 0 : early ? 20 : upper ? 3 : coop ? 14 : 9;
  parts.push({
    label: senior ? "Senior/grad-level title" : early ? "Open to 1st/2nd years" : upper ? "Prefers upper years" : coop ? "Co-op friendly" : "Year not specified",
    points: level,
    max: 20,
  });

  // Fit (15): the fit score from 40 (barely relevant) to 90 (nearly every bonus).
  const fit = job.fitScore ?? 55;
  parts.push({ label: job.fitScore == null ? "Fit unknown" : `Fit ${fit}`, points: Math.max(0, Math.min(1, (fit - 40) / 50)) * 15, max: 15 });

  // Eligibility (10).
  const sponsors = flags.includes("sponsors") || reasons.includes("+Sponsors visas");
  const where =
    job.region === "canada" ? { label: "In Canada", points: 10 }
    : job.region === "remote" ? { label: "Remote", points: 8 }
    : job.region === "us" ? (sponsors ? { label: "U.S., sponsors visas", points: 6 } : { label: "U.S.: needs a visa", points: 3 })
    : job.region === "intl" ? { label: "Outside North America", points: 2 }
    : { label: "Location unclear", points: 6 };
  parts.push({ ...where, max: 10 });

  let score = parts.reduce((s, p) => s + p.points, 0);
  // A red flag in the posting (citizenship, clearance, wrong grad year, term already started, ...)
  // usually means an auto-reject.
  const blocked = flags.some((f) => (HARD_FLAGS as readonly string[]).includes(f));
  if (job.warnings?.length || blocked) {
    score *= 0.4;
    parts.push({ label: blocked ? "Posting rules you out" : "Eligibility red flag", points: 0, max: 0 });
  }
  return { score: Math.round(Math.max(0, Math.min(100, score))), parts };
}
