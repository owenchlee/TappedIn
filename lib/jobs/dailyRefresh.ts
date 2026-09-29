import { prisma } from "@/lib/db";
import { listEnabledSources, loadedSourceFromRow } from "@/lib/sources/load";
import { createFetchCtx } from "@/lib/sources/fetchSource";
import { getAdapter } from "@/lib/sources/adapters";
import { applyMatch } from "@/lib/sources/filter";
import { diffPostings } from "@/lib/sources/diff";
import { applyDiff, type ExistingPostingMeta } from "@/lib/sources/apply";
import { categoryFromTitle, regionForLocation } from "@/lib/sources/normalize";
import { termsFromText } from "@/lib/terms";
import { importMlhHackathons, type HackathonImportSummary } from "@/lib/hackathons/mlh";
import { runOrgWatch, type OrgWatchSummary } from "@/lib/watch/orgWatch";
import type { LoadedSource, RawPosting } from "@/lib/sources/types";

export const JOB_KEY = "daily-refresh";

// globalThis-scoped (not a module-level `let`) because instrumentation.ts, route handlers, and
// server actions can end up as separate bundled module instances in the same Node process — a
// plain module-level flag would not be shared between them, defeating the re-entrancy guard.
const globalForRefresh = globalThis as unknown as { coophubRefreshRunning?: boolean };

export function isRefreshRunning(): boolean {
  return globalForRefresh.coophubRefreshRunning === true;
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  globalForRefresh.coophubRefreshRunning = true;
  try {
    return await fn();
  } finally {
    globalForRefresh.coophubRefreshRunning = false;
  }
}

export type SourceRunSummary = {
  sourceKey: string;
  ok: boolean;
  created: number;
  touched: number;
  missed: number;
  duplicates?: number;
  error?: string;
};

/** Fills the facets a source didn't provide (term, region, category) from the title and location. */
export function enrich(p: RawPosting): RawPosting {
  return {
    ...p,
    terms: p.terms && p.terms.length > 0 ? p.terms : termsFromText(p.title),
    region: p.region ?? regionForLocation(p.location) ?? undefined,
    category: p.category ?? categoryFromTitle(p.title),
  };
}

async function runOneSource(source: LoadedSource): Promise<SourceRunSummary> {
  const run = await prisma.sourceRun.create({ data: { sourceKey: source.key } });

  try {
    const adapter = getAdapter(source.adapter);
    const ctx = createFetchCtx();
    const raw = await adapter.fetch(source, ctx);
    const filtered = applyMatch(raw.map(enrich), source.match);

    const existingRows = await prisma.coopPosting.findMany({
      where: { sourceKey: source.key, origin: "fetched" },
      select: { id: true, externalKey: true, missCount: true, disappearedAt: true, dismissedAt: true },
    });

    const diff = diffPostings(
      existingRows
        .filter((r): r is typeof r & { externalKey: string } => r.externalKey != null)
        .map((r) => ({ id: r.id, externalKey: r.externalKey, missCount: r.missCount, disappearedAt: r.disappearedAt })),
      filtered,
    );

    if (!diff.ok) {
      throw new Error(`Diff rejected the run: ${diff.reason ?? "unknown reason"}`);
    }

    const existingMeta = new Map<string, ExistingPostingMeta>(
      existingRows.map((r) => [r.id, { disappearedAt: r.disappearedAt, dismissedAt: r.dismissedAt }]),
    );
    const result = await applyDiff({ sourceKey: source.key, companyName: source.name, diff, existingMeta });

    const now = new Date();
    await Promise.all([
      prisma.sourceRun.update({
        where: { id: run.id },
        data: { finishedAt: now, ok: true, fetched: filtered.length, created: result.created, missed: result.missed },
      }),
      prisma.companySource.update({
        where: { key: source.key },
        data: { lastRunAt: now, lastOkAt: now, lastError: null, lastFetchedCount: filtered.length },
      }),
    ]);

    return { sourceKey: source.key, ok: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date();
    await Promise.all([
      prisma.sourceRun.update({ where: { id: run.id }, data: { finishedAt: now, ok: false, error: message } }),
      prisma.companySource.update({ where: { key: source.key }, data: { lastRunAt: now, lastError: message } }),
    ]);
    return { sourceKey: source.key, ok: false, created: 0, touched: 0, missed: 0, error: message };
  }
}

export type DailyRefreshResult = {
  sources: SourceRunSummary[];
  hackathons: HackathonImportSummary | null;
  watch: OrgWatchSummary | null;
};

/**
 * The single daily entry point (Vercel Cron → /api/cron/refresh, or the local node-cron scheduler).
 * Sources run in priority order — aggregators are listed first in data/company-sources.json so that
 * direct company boards dedupe onto them rather than the other way around.
 */
export async function runDailyRefresh(): Promise<DailyRefreshResult> {
  if (isRefreshRunning()) {
    return { sources: [], hackathons: null, watch: null };
  }

  return withRefreshLock(async () => {
    const sources = await listEnabledSources();
    const summaries: SourceRunSummary[] = [];

    for (const source of sources) {
      summaries.push(await runOneSource(source));
      // Politeness delay between sources — this is a personal, low-volume fetcher, not a scraper farm.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const hackathons = await importMlhHackathons();
    // A watcher failure (e.g. DB hiccup) must not lose the sources/MLH results above.
    const watch = await runOrgWatch().catch((err) => {
      console.error("[watch] org watch failed:", err);
      return null;
    });

    const now = new Date();
    const anyFailed = summaries.some((s) => !s.ok) || !hackathons.ok;
    await prisma.jobState.upsert({
      where: { key: JOB_KEY },
      create: { key: JOB_KEY, lastRunAt: now, lastOkAt: anyFailed ? null : now },
      update: { lastRunAt: now, ...(anyFailed ? {} : { lastOkAt: now }), lastError: anyFailed ? "one or more sources failed" : null },
    });

    return { sources: summaries, hackathons, watch };
  });
}

/** Runs a single source on demand (the /sources dashboard's "Run now" button), regardless of its enabled flag. */
export async function runSourceByKey(key: string): Promise<SourceRunSummary> {
  if (isRefreshRunning()) {
    return {
      sourceKey: key,
      ok: false,
      created: 0,
      touched: 0,
      missed: 0,
      error: "A refresh is already running — try again shortly.",
    };
  }

  return withRefreshLock(async () => {
    const row = await prisma.companySource.findUniqueOrThrow({ where: { key } });
    return runOneSource(loadedSourceFromRow(row));
  });
}
