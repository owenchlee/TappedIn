import { writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notBlocked } from "@/lib/data/jobs";
import { createJob, jobDir, listJobs } from "./job";
import { getJobPrefs } from "@/lib/fit/store";
import { termsInText } from "@/lib/fit/requirements";
import { usVisaOk } from "./sponsors";
import { inTargetTerm, isQueued, mentionsCanada, realismScore, spreadPicks, unrealisticTitle } from "./queue";

// The app side of the nightly batch (scripts/nightly.ts drives it through /api/cron/nightly, so the
// one-connection local database is only ever used by the app). Picks recent jobs a first-year in
// Canada can realistically get and hasn't touched, and creates one tailoring job at a time; the
// script runs the tailoring.

export type NightlyPick = { postingId: string; company: string; role: string; fitScore: number | null; deadline: string | null };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Posting text (checked for the term, and for Canada on remote jobs) is read a few rows at a time because
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
  // Only the terms Owen is applying for (Summer 2027); a posting that never names its term counts too.
  const { targetTerms, categories } = await getJobPrefs();
  const rows = await prisma.coopPosting.findMany({
    where: {
      AND: [
        { duplicateOfId: null, saved: null, dismissedAt: null, disappearedAt: null, status: { not: "closed" } },
        { fitScore: { gte: opts.minScore }, detailsStatus: "ok", OR: [{ terms: { hasSome: targetTerms } }, { terms: { isEmpty: true } }] },
        // Only the fields picked in Settings (software, data, ...): "Not a tech role" costs just 10
        // points, so a non-tech co-op (GIS at a coal mine) could still score in the 80s.
        { category: { in: categories } },
        // Posted recently (the list's date when it has one, else when we first saw it).
        { firstSeenAt: { gte: since } },
        { OR: [{ postedAt: null }, { postedAt: { gte: since } }] },
        // At least a day left to apply.
        { OR: [{ deadline: null }, { deadline: { gte: new Date(Date.now() + 24 * HOUR) } }] },
        // Workable as a Canadian: in Canada, remote (checked for Canada below), or in the U.S. with a
        // sponsored visa (checked below).
        { OR: [{ region: { in: ["canada", "remote", "us"] } }, { region: null }] },
        notBlocked,
        { NOT: { flags: { has: "upper_pref" } } },
      ],
    },
    select: { id: true, company: true, role: true, region: true, terms: true, fitScore: true, fitReasons: true, postedAt: true, firstSeenAt: true, deadline: true },
    take: 1000,
  });

  const now = new Date();
  const ranked = rows
    .filter((r) => !taken.has(r.id) && !takenTitles.has(key(r.company, r.role)) && !unrealisticTitle(r.role) && inTargetTerm(r.terms, r.role, targetTerms))
    .map((r) => ({ ...r, rank: realismScore(r, now) }))
    .sort((a, b) => b.rank - a.rank);

  // Walk the ranking, reading each posting's text: its own term has to agree, a U.S. job needs a visa
  // sponsor, and a remote job counts once the text mentions Canada (or it's a U.S. one with a sponsor).
  const eligible: typeof ranked = [];
  for (let i = 0; i < ranked.length && spreadPicks(eligible, opts.target).length < opts.target; i += TEXT_BATCH) {
    const slice = ranked.slice(i, i + TEXT_BATCH);
    const texts = new Map(
      (await prisma.coopPosting.findMany({ where: { id: { in: slice.map((r) => r.id) } }, select: { id: true, details: true } })).map((t) => [t.id, t.details ?? ""]),
    );
    for (const r of slice) {
      const text = texts.get(r.id) ?? "";
      if (!inTargetTerm(r.terms, r.role, targetTerms, termsInText(`${r.role}\n${text}`))) continue;
      if (r.region === "us" && !usVisaOk(r.company, text)) continue;
      if (r.region !== "remote" || mentionsCanada(text) || usVisaOk(r.company, text)) eligible.push(r);
    }
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
