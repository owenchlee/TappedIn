import { prisma } from "@/lib/db";
import { listEnabledSources, loadedSourceFromRow } from "@/lib/sources/load";
import { createFetchCtx } from "@/lib/sources/fetchSource";
import { getAdapter } from "@/lib/sources/adapters";
import { applyMatch } from "@/lib/sources/filter";
import { diffPostings } from "@/lib/sources/diff";
import { applyDiff, type ExistingPostingMeta } from "@/lib/sources/apply";
import type { LoadedSource } from "@/lib/sources/types";

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
  error?: string;
};

async function runOneSource(source: LoadedSource): Promise<SourceRunSummary> {
  const run = await prisma.sourceRun.create({ data: { sourceKey: source.key } });

  try {
    const adapter = getAdapter(source.adapter);
    const ctx = createFetchCtx();
    const raw = await adapter.fetch(source, ctx);
    const filtered = applyMatch(raw, source.match);

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
    const result = await applyDiff({
      sourceKey: source.key,
      companyName: source.name,
      diff,
      existingMeta,
    });

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

export async function runDailyRefresh(): Promise<SourceRunSummary[]> {
  if (isRefreshRunning()) {
    return [];
  }

  return withRefreshLock(async () => {
    const sources = await listEnabledSources();
    const summaries: SourceRunSummary[] = [];

    for (const source of sources) {
      summaries.push(await runOneSource(source));
      // Politeness delay between sources — this is a personal, low-volume fetcher, not a scraper farm.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const now = new Date();
    const anyFailed = summaries.some((s) => !s.ok);
    await prisma.jobState.upsert({
      where: { key: JOB_KEY },
      create: { key: JOB_KEY, lastRunAt: now, lastOkAt: anyFailed ? null : now },
      update: { lastRunAt: now, ...(anyFailed ? {} : { lastOkAt: now }), lastError: anyFailed ? "one or more sources failed" : null },
    });

    return summaries;
  });
}

/** Runs a single source on demand (used by the /sources dashboard's "Run now" button), regardless of its enabled flag. */
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
