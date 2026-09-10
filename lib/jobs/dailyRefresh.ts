import { prisma } from "@/lib/db";
import { listEnabledSources, loadedSourceFromRow } from "@/lib/sources/load";
import { createFetchCtx } from "@/lib/sources/fetchSource";
import { getAdapter } from "@/lib/sources/adapters";
import { applyMatch } from "@/lib/sources/filter";
import { diffPostings } from "@/lib/sources/diff";
import { applyDiff } from "@/lib/sources/apply";
import type { LoadedSource } from "@/lib/sources/types";

export const JOB_KEY = "daily-refresh";

let isRunning = false;

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
      select: { id: true, externalKey: true, missCount: true, disappearedAt: true },
    });

    const diff = diffPostings(
      existingRows
        .filter((r): r is typeof r & { externalKey: string } => r.externalKey != null)
        .map((r) => ({ id: r.id, externalKey: r.externalKey, missCount: r.missCount })),
      filtered,
    );

    if (!diff.ok) {
      throw new Error(`Diff rejected the run: ${diff.reason ?? "unknown reason"}`);
    }

    const existingDisappearedAt = new Map(existingRows.map((r) => [r.id, r.disappearedAt]));
    const result = await applyDiff({
      sourceKey: source.key,
      companyName: source.name,
      diff,
      existingDisappearedAt,
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
  if (isRunning) {
    return [];
  }
  isRunning = true;

  try {
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
  } finally {
    isRunning = false;
  }
}

/** Runs a single source on demand (used by the /sources dashboard's "Run now" button), regardless of its enabled flag. */
export async function runSourceByKey(key: string): Promise<SourceRunSummary> {
  const row = await prisma.companySource.findUniqueOrThrow({ where: { key } });
  return runOneSource(loadedSourceFromRow(row));
}
