import os from "node:os";
import path from "node:path";
import type { Job } from "./job";

// The morning queue: what the nightly batch (scripts/nightly.ts) tailored and Owen hasn't applied to
// or skipped yet. Pure, so the picker and the queue page agree on what "still waiting" means.

const HOUR = 3_600_000;
/** Jobs closing within this window jump the queue. */
export const CLOSING_SOON_MS = 72 * HOUR;

/** Tailored by a nightly batch, documents ready, not yet applied to or skipped, deadline not passed. */
export function isQueued(job: Job, now = new Date()): boolean {
  if (!job.batch || job.submittedAt || job.skippedAt || job.status !== "ready") return false;
  return !job.deadline || Date.parse(job.deadline) > now.getTime() - 12 * HOUR;
}

/** Pinned first, then closing within three days (soonest first), then best fit, then oldest batch. */
export function queueOrder(jobs: Job[], now = new Date()): Job[] {
  const soon = (j: Job) => (j.deadline && Date.parse(j.deadline) - now.getTime() < CLOSING_SOON_MS ? Date.parse(j.deadline) : Infinity);
  return jobs
    .filter((j) => isQueued(j, now))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || soon(a) - soon(b) || (b.fitScore ?? 0) - (a.fitScore ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

/** How many new jobs tonight's batch should tailor so the queue holds `target` again. */
export function topUpCount(jobs: Job[], target: number, now = new Date()): number {
  return Math.max(0, target - jobs.filter((j) => isQueued(j, now)).length);
}

/**
 * Pick in score order until `count` are chosen: at most `perCompany` from one company, and one of
 * each title (the same role posted for several cities is one application's worth of tailoring).
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
