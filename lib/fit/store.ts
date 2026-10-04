import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getSetting, setSetting } from "@/lib/data/settings";
import { createDetailCache, fetchPostingDetail, type DetailResult } from "@/lib/details/fetch";
import { parsePrefs, PREFS_KEY, type JobPrefs } from "@/lib/fit/prefs";
import { scoreJob } from "@/lib/fit/score";
import { termsInText } from "@/lib/fit/requirements";
import { postingTerms } from "@/lib/sources/enrich";
import { regionForLocations } from "@/lib/sources/normalize";
import { plausibleTerms } from "@/lib/terms";

const DAY = 86_400_000;

export async function getJobPrefs(): Promise<JobPrefs> {
  return parsePrefs(await getSetting(PREFS_KEY));
}

export async function saveJobPrefs(prefs: JobPrefs): Promise<void> {
  await setSetting(PREFS_KEY, JSON.stringify(prefs));
}

const BATCH = 400;

/**
 * A fetched job's region, re-read from its location so fixes to the location rules reach rows stored
 * before them ("New Brunswick, NJ" was once Canada). Never moves a job to "remote" on its own: a
 * mixed "US, Remote" list is ambiguous, and the source's call stands.
 */
export function effectiveRegion(r: { region: string | null; location: string | null }): string | null {
  const now = r.location ? regionForLocations(r.location.split(" · ")) : null;
  return now && now !== "remote" ? now : r.region;
}

/**
 * A fetched job's terms, minus ones already over when it was posted (mislabelled by the list), and
 * read from the posting text when nothing else is left.
 */
export function effectiveTerms(r: { terms: string[]; role: string; postedAt: Date | null; firstSeenAt: Date; details: string | null }): string[] {
  const posted = r.postedAt ?? r.firstSeenAt;
  const terms = postingTerms(r.terms, r.role, posted);
  return terms.length > 0 || !r.details ? terms : plausibleTerms(termsInText(r.details), posted);
}

/**
 * Recomputes fitScore / fitReasons / flags for canonical postings (all of them, or only the ones
 * never scored). A few thousand rows; each batch is one UPDATE.
 */
export async function rescoreJobs(opts: { onlyUnscored?: boolean; ids?: string[] } = {}): Promise<number> {
  const prefs = await getJobPrefs();
  const now = new Date();
  const where: Prisma.CoopPostingWhereInput = {
    duplicateOfId: null,
    ...(opts.onlyUnscored ? { fitScore: null } : {}),
    ...(opts.ids ? { id: { in: opts.ids } } : {}),
  };
  let cursor: string | undefined;
  let done = 0;
  for (;;) {
    const rows = await prisma.coopPosting.findMany({
      where,
      select: {
        id: true,
        origin: true,
        role: true,
        terms: true,
        category: true,
        region: true,
        location: true,
        postedAt: true,
        firstSeenAt: true,
        deadline: true,
        details: true,
        detailsStatus: true,
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    const values = rows.map((r) => {
      const fetched = r.origin !== "manual";
      const terms = fetched ? effectiveTerms(r) : r.terms;
      const region = fetched ? effectiveRegion(r) : r.region;
      const fit = scoreJob({ ...r, terms, region }, prefs, now);
      return { id: r.id, terms, region, score: fit.score, reasons: fit.reasons, flags: fit.flags };
    });
    await prisma.$executeRaw`
      UPDATE "CoopPosting" AS c
      SET "terms" = v.terms, "region" = v.region, "fitScore" = v.score, "fitReasons" = v.reasons, "flags" = v.flags
      FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS v(id text, terms text[], region text, score int, reasons text[], flags text[])
      WHERE c.id = v.id`;
    done += rows.length;
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return done;
}

export type DetailsSummary = { attempted: number; ok: number; gone: number; unsupported: number; error: number; outOfTime: boolean };

type Candidate = { id: string; url: string; saved: { id: string } | null; disappearedAt: Date | null };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Jobs whose posting text is worth (re)reading, best matches first:
 *  1. never read;
 *  2. a failed read more than 2 days ago;
 *  3. a good match read more than a week ago, to catch postings that were taken down.
 */
async function detailCandidates(limit: number): Promise<Candidate[]> {
  const now = Date.now();
  const select = { id: true, url: true, saved: { select: { id: true } }, disappearedAt: true } as const;
  const open = { duplicateOfId: null, status: { not: "closed" } } satisfies Prisma.CoopPostingWhereInput;
  const order: Prisma.CoopPostingOrderByWithRelationInput[] = [{ fitScore: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }];
  const fresh = await prisma.coopPosting.findMany({ where: { ...open, detailsAt: null }, select, orderBy: order, take: limit });
  if (fresh.length >= limit) return fresh;
  const retry = await prisma.coopPosting.findMany({
    where: { ...open, detailsStatus: "error", detailsAt: { lt: new Date(now - 2 * DAY) } },
    select,
    orderBy: order,
    take: limit - fresh.length,
  });
  const recheck = await prisma.coopPosting.findMany({
    where: { ...open, detailsStatus: "ok", detailsAt: { lt: new Date(now - 7 * DAY) }, fitScore: { gte: 60 } },
    select,
    orderBy: order,
    take: Math.max(0, Math.min(150, limit - fresh.length - retry.length)),
  });
  return [...fresh, ...retry, ...recheck];
}

async function saveDetail(job: Candidate, result: DetailResult, now: Date): Promise<void> {
  const base = { detailsAt: now, detailsStatus: result.status };
  if (result.status === "ok") {
    await prisma.coopPosting.update({ where: { id: job.id }, data: { ...base, details: result.text, detailsError: null } });
  } else if (result.status === "gone") {
    // The ATS says the job no longer exists. Close it, unless you're tracking it: then it stays
    // put with a "taken down" flag so the application doesn't vanish from under you.
    await prisma.coopPosting.update({
      where: { id: job.id },
      data: {
        ...base,
        detailsError: result.reason,
        ...(job.saved ? {} : { status: "closed", disappearedAt: job.disappearedAt ?? now, dismissedAt: now }),
      },
    });
  } else {
    await prisma.coopPosting.update({ where: { id: job.id }, data: { ...base, detailsError: result.reason } });
  }
}

/**
 * Reads posting text for up to `limit` jobs within `budgetMs`, at most `perHost` requests at a time
 * to any one site and `concurrency` overall. Re-scores the jobs it read.
 */
export async function refreshDetails(opts: { budgetMs: number; limit?: number; concurrency?: number; perHost?: number; log?: (msg: string) => void }): Promise<DetailsSummary> {
  const deadline = Date.now() + opts.budgetMs;
  const concurrency = opts.concurrency ?? 8;
  const perHost = opts.perHost ?? 2;
  const queue = await detailCandidates(opts.limit ?? 5_000);
  const cache = createDetailCache();
  const inFlight = new Map<string, number>();
  const summary: DetailsSummary = { attempted: 0, ok: 0, gone: 0, unsupported: 0, error: 0, outOfTime: false };
  const touched: string[] = [];
  // Writes go through one chain: the local DB serves a single connection at a time.
  let writes: Promise<void> = Promise.resolve();

  const next = (): Candidate | undefined => {
    const i = queue.findIndex((j) => (inFlight.get(hostOf(j.url)) ?? 0) < perHost);
    return i < 0 ? undefined : queue.splice(i, 1)[0];
  };

  async function worker() {
    while (queue.length > 0) {
      if (Date.now() > deadline) {
        summary.outOfTime = true;
        return;
      }
      const job = next();
      if (!job) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      const host = hostOf(job.url);
      inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
      try {
        const result = await fetchPostingDetail(job.url, cache);
        summary.attempted++;
        summary[result.status]++;
        touched.push(job.id);
        writes = writes.then(() => saveDetail(job, result, new Date())).catch((err) => opts.log?.(`save failed for ${job.id}: ${err}`));
        if (summary.attempted % 100 === 0) opts.log?.(`${summary.attempted} read (${summary.ok} ok, ${summary.gone} gone, ${summary.unsupported} unsupported, ${summary.error} errors)`);
      } finally {
        inFlight.set(host, (inFlight.get(host) ?? 1) - 1);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  await writes;
  for (let i = 0; i < touched.length; i += 1_000) await rescoreJobs({ ids: touched.slice(i, i + 1_000) });
  return summary;
}
