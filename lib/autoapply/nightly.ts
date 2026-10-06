import { writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notBlocked } from "@/lib/data/jobs";
import { createJob, jobDir, listJobs } from "./job";
import { isQueued, mentionsCanada, realismScore, spreadPicks, unrealisticTitle } from "./queue";

// The app side of the nightly batch (scripts/nightly.ts drives it through /api/cron/nightly, so the
// one-connection local database is only ever used by the app). Picks recent jobs a first-year in
// Canada can realistically get and hasn't touched, and creates one tailoring job at a time; the
// script runs the tailoring.

export type NightlyPick = { postingId: string; company: string; role: string; fitScore: number | null; deadline: string | null };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Remote postings whose text gets checked for Canada; the text is read a few rows at a time because
// the local database falls over on big text scans.
const TEXT_BATCH = 20;

export async function pickNightly(opts: { target: number; minScore: number; maxAgeDays: number }): Promise<{ queued: number; picks: NightlyPick[] }> {
  const jobs = listJobs();
  const queued = jobs.filter((j) => isQueued(j)).length;

  // Anything tailored before (by hand or by an earlier night, even if it failed) isn't picked again.
  const taken = new Set(jobs.filter((j) => j.source.kind === "coop").map((j) => j.source.id));
  // The same job listed again by another source has a new id but the same company and title.
  const key = (company: string, role: string) => `${company}|${role}`.toLowerCase().replace(/\s+/g, " ").trim();
  const takenTitles = new Set(jobs.map((j) => key(j.company, j.role)));
  const since = new Date(Date.now() - opts.maxAgeDays * DAY);
  const rows = await prisma.coopPosting.findMany({
    where: {
      AND: [
        { duplicateOfId: null, saved: null, dismissedAt: null, disappearedAt: null, status: { not: "closed" } },
        { fitScore: { gte: opts.minScore }, detailsStatus: "ok" },
        // Posted recently (the list's date when it has one, else when we first saw it).
        { firstSeenAt: { gte: since } },
        { OR: [{ postedAt: null }, { postedAt: { gte: since } }] },
        // At least a day left to apply.
        { OR: [{ deadline: null }, { deadline: { gte: new Date(Date.now() + 24 * HOUR) } }] },
        // Workable as a Canadian: in Canada, or remote (checked for Canada below). U.S. jobs need a
        // sponsored visa, which first-year internships rarely offer.
        { OR: [{ region: { in: ["canada", "remote"] } }, { region: null }] },
        notBlocked,
        { NOT: { flags: { has: "upper_pref" } } },
      ],
    },
    select: { id: true, company: true, role: true, region: true, fitScore: true, fitReasons: true, postedAt: true, firstSeenAt: true, deadline: true },
    take: 1000,
  });

  const now = new Date();
  const ranked = rows
    .filter((r) => !taken.has(r.id) && !takenTitles.has(key(r.company, r.role)) && !unrealisticTitle(r.role))
    .map((r) => ({ ...r, rank: realismScore(r, now) }))
    .sort((a, b) => b.rank - a.rank);

  // Walk the ranking; a remote job only counts once its posting text mentions Canada.
  const eligible: typeof ranked = [];
  for (let i = 0; i < ranked.length && spreadPicks(eligible, opts.target).length < opts.target; i += TEXT_BATCH) {
    const slice = ranked.slice(i, i + TEXT_BATCH);
    const remoteIds = slice.filter((r) => r.region === "remote").map((r) => r.id);
    const texts = remoteIds.length
      ? new Map((await prisma.coopPosting.findMany({ where: { id: { in: remoteIds } }, select: { id: true, details: true } })).map((t) => [t.id, t.details ?? ""]))
      : new Map<string, string>();
    for (const r of slice) if (r.region !== "remote" || mentionsCanada(texts.get(r.id) ?? "")) eligible.push(r);
  }

  const picks = spreadPicks(eligible, opts.target).map((r) => ({
    postingId: r.id,
    company: r.company,
    role: r.role,
    fitScore: r.fitScore,
    deadline: r.deadline?.toISOString() ?? null,
  }));
  return { queued, picks };
}

/** Creates the tailoring job for one pick (job.json + the posting text); the caller runs it. */
export async function createNightlyJob(postingId: string, batch: string): Promise<string> {
  const p = await prisma.coopPosting.findUniqueOrThrow({
    where: { id: postingId },
    select: { id: true, company: true, role: true, url: true, region: true, details: true, fitScore: true, deadline: true },
  });
  const job = createJob({
    source: { kind: "coop", id: p.id },
    company: p.company,
    role: p.role,
    url: p.url,
    region: p.region,
    batch,
    fitScore: p.fitScore,
    deadline: p.deadline?.toISOString() ?? null,
  });
  if (p.details?.trim()) writeFileSync(path.join(jobDir(job.id), "jd.txt"), p.details);
  return job.id;
}
