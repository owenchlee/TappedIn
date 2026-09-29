import { prisma } from "@/lib/db";
import { createFetchCtx } from "@/lib/sources/fetchSource";
import { extractText, scanText, signalFor, type WatchLevel } from "@/lib/watch/signals";

export type OrgWatchSummary = { checked: number; signals: number; failed: number };

/**
 * Daily scan of every hand-curated org's site (MLH imports already carry structured dates) for
 * signs a new application cycle is starting. Escalations set `signal`/`signalAt`, which re-surfaces
 * the org on the home page — and in the list views even if its last event is already past.
 */
export async function runOrgWatch(now: Date = new Date()): Promise<OrgWatchSummary> {
  const orgs = await prisma.organization.findMany({
    where: { origin: "seed", managed: true },
    select: { id: true, url: true, applyUrl: true, watchLevel: true, watchYear: true },
  });
  const ctx = createFetchCtx();
  const summary: OrgWatchSummary = { checked: 0, signals: 0, failed: 0 };

  for (const org of orgs) {
    const urls = [org.url, ...(org.applyUrl && org.applyUrl !== org.url ? [org.applyUrl] : [])];
    const texts: string[] = [];
    const errors: string[] = [];
    for (const url of urls) {
      try {
        texts.push(extractText(await ctx.fetchText(url)));
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (texts.length === 0) {
      summary.failed++;
      await prisma.organization.update({
        where: { id: org.id },
        data: { watchedAt: now, watchError: errors.join("; ").slice(0, 500) },
      });
      continue;
    }

    const scan = scanText(texts.join(" "), now);
    const signal = signalFor({ level: org.watchLevel as WatchLevel | null, maxYear: org.watchYear }, scan);
    summary.checked++;
    if (signal) summary.signals++;

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        watchLevel: scan.level,
        // Keep the highest year ever seen so a page temporarily dropping "2027" doesn't re-alert later.
        watchYear: Math.max(scan.maxYear ?? 0, org.watchYear ?? 0) || null,
        watchedAt: now,
        watchError: errors.length ? errors.join("; ").slice(0, 500) : null,
        ...(signal ? { signal, signalAt: now, signalSeenAt: null } : {}),
      },
    });

    // Politeness delay — a personal watcher, not a crawler.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return summary;
}
