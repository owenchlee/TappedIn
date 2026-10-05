import { writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notBlocked } from "@/lib/data/jobs";
import { createJob, jobDir, listJobs } from "./job";
import { spreadPicks, topUpCount } from "./queue";

// The app side of the nightly batch (scripts/nightly.ts drives it through /api/cron/nightly, so the
// one-connection local database is only ever used by the app). Picks the best jobs Owen can apply to
// and hasn't touched, and creates one tailoring job at a time; the script runs the tailoring.

export type NightlyPick = { postingId: string; company: string; role: string; fitScore: number | null; deadline: string | null };

const HOUR = 3_600_000;

export async function pickNightly(opts: { target: number; minScore: number }): Promise<{ queued: number; picks: NightlyPick[] }> {
  const jobs = listJobs();
  const want = topUpCount(jobs, opts.target);
  const queued = opts.target - want;
  if (want === 0) return { queued, picks: [] };

  // Anything tailored before (by hand or by an earlier night, even if it failed) isn't picked again.
  const taken = new Set(jobs.filter((j) => j.source.kind === "coop").map((j) => j.source.id));
  const rows = await prisma.coopPosting.findMany({
    where: {
      AND: [
        { duplicateOfId: null, saved: null, dismissedAt: null, disappearedAt: null, status: { not: "closed" } },
        { fitScore: { gte: opts.minScore }, detailsStatus: "ok" },
        // At least a day left to apply; the Jobs page's default regions (Canada, remote).
        { OR: [{ deadline: null }, { deadline: { gte: new Date(Date.now() + 24 * HOUR) } }] },
        { OR: [{ region: { in: ["canada", "remote"] } }, { region: null }] },
        notBlocked,
      ],
    },
    orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }],
    select: { id: true, company: true, role: true, fitScore: true, deadline: true },
    take: 300,
  });
  const picks = spreadPicks(
    rows.filter((r) => !taken.has(r.id)),
    want,
  ).map((r) => ({ postingId: r.id, company: r.company, role: r.role, fitScore: r.fitScore, deadline: r.deadline?.toISOString() ?? null }));
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
