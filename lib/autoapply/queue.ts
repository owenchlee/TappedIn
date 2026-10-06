import os from "node:os";
import path from "node:path";
import type { Job } from "./job";

// The morning queue: what the nightly batch (scripts/nightly.ts) tailored and Owen hasn't applied to
// or skipped yet, plus the rules the batch picks jobs by. Pure, so the picker and the queue page
// agree on what "still waiting" means.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Jobs closing within this window jump the queue. */
export const CLOSING_SOON_MS = 72 * HOUR;
/** A night's batch stays in the queue this many days (today's, yesterday's, the day before's). */
export const QUEUE_DAYS = 3;

/** Midnight in Toronto at the start of a batch date ("2026-10-05"). */
function batchStart(batch: string): number {
  return Date.parse(`${batch}T00:00:00-04:00`);
}

/**
 * Tailored by a nightly batch in the last few days (or pinned), documents ready, not yet applied to
 * or skipped, deadline not passed. Older ones drop off so the queue stays fresh; they stay in Resumes.
 */
export function isQueued(job: Job, now = new Date()): boolean {
  if (!job.batch || job.submittedAt || job.skippedAt || job.status !== "ready") return false;
  if (!job.pinned && !job.keep && now.getTime() - batchStart(job.batch) >= QUEUE_DAYS * DAY) return false;
  return !job.deadline || Date.parse(job.deadline) > now.getTime() - 12 * HOUR;
}

/** Pinned first, then closing within three days (soonest first), then the newest batch, then best fit. */
export function queueOrder(jobs: Job[], now = new Date()): Job[] {
  const soon = (j: Job) => (j.deadline && Date.parse(j.deadline) - now.getTime() < CLOSING_SOON_MS ? Date.parse(j.deadline) : Infinity);
  return jobs
    .filter((j) => isQueued(j, now))
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        soon(a) - soon(b) ||
        (b.batch ?? "").localeCompare(a.batch ?? "") ||
        (b.fitScore ?? 0) - (a.fitScore ?? 0) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** Roles a first-year without work experience realistically won't get: senior, research, grad-level. */
export function unrealisticTitle(role: string): boolean {
  return /\b(senior|sr\.?|staff|principal|lead|manager|director|phd|ph\.d|masters?|master's|mba|graduate|new grad|research(er)?|scientist|postdoc(toral)?)\b/i.test(role);
}

/** Whether a remote posting's text says Canadians can take it. */
export function mentionsCanada(text: string): boolean {
  return /\bcanad(a|ian)\b|\b(ontario|toronto|waterloo|vancouver|montr[eé]al|ottawa|calgary|british columbia|qu[eé]bec)\b/i.test(text);
}

/**
 * How good a nightly pick is for Owen: the fit score, plus extra weight on what makes a job
 * realistic for a first-year (open to early students, co-op) and on how recently it was posted.
 */
export function realismScore(r: { fitScore: number | null; fitReasons: string[]; postedAt: Date | null; firstSeenAt: Date }, now = new Date()): number {
  const posted = r.postedAt && r.postedAt < r.firstSeenAt ? r.postedAt : r.firstSeenAt;
  const age = (now.getTime() - posted.getTime()) / DAY;
  let s = r.fitScore ?? 0;
  if (r.fitReasons.includes("+Open to 1st/2nd years")) s += 15;
  if (r.fitReasons.includes("+Co-op friendly")) s += 8;
  if (age <= 2) s += 12;
  else if (age <= 7) s += 6;
  return s;
}

/**
 * Pick in order until `count` are chosen: at most `perCompany` from one company, and one of each
 * title (the same role posted for several cities is one application's worth of tailoring).
 */
export function spreadPicks<T extends { company: string; role: string }>(rows: T[], count: number, perCompany = 2): T[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const perCo = new Map<string, number>();
  const titles = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (out.length >= count) break;
    const co = norm(r.company);
    const title = `${co}|${norm(r.role)}`;
    const n = perCo.get(co) ?? 0;
    if (n >= perCompany || titles.has(title)) continue;
    perCo.set(co, n + 1);
    titles.add(title);
    out.push(r);
  }
  return out;
}

/** Documents\Apply Today: holds the current queue job's PDFs, so file pickers always open on them. */
export function applyFolder(): string {
  return path.join(os.homedir(), "Documents", "Apply Today");
}
