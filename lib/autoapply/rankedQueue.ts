import { prisma } from "@/lib/db";
import type { Job } from "./job";
import { isQueued, queueOrder } from "./queue";
import { roiScore, type Roi } from "./roi";

export type RankedJob = Job & { roi: Roi };

/**
 * The morning queue, sorted by ROI. Reads each job's posting date and fit from the Jobs list, by id
 * only (the local database falls over on big scans). A job with no posting there (one added by URL,
 * source id "manual") uses the postedAt/fitScore/fitReasons saved on the job itself.
 */
export async function rankedQueue(jobs: Job[], now = new Date()): Promise<RankedJob[]> {
  const queued = jobs.filter((j) => isQueued(j, now));
  const ids = queued.filter((j) => j.source.kind === "coop" && j.source.id !== "manual").map((j) => j.source.id);
  const rows = ids.length
    ? await prisma.coopPosting.findMany({
        where: { id: { in: ids } },
        select: { id: true, postedAt: true, firstSeenAt: true, fitScore: true, fitReasons: true, flags: true, region: true },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const roi = new Map<string, Roi>();
  for (const j of queued) {
    const p = byId.get(j.source.id);
    const posted = p ? (p.postedAt && p.postedAt < p.firstSeenAt ? p.postedAt : p.firstSeenAt) : j.postedAt ? new Date(j.postedAt) : null;
    roi.set(
      j.id,
      roiScore(
        {
          company: j.company,
          role: j.role,
          region: j.region ?? p?.region,
          fitScore: p?.fitScore ?? j.fitScore,
          fitReasons: p?.fitScore != null ? p.fitReasons : j.fitReasons,
          flags: p?.flags,
          warnings: j.warnings,
          postedAt: posted,
          foundAt: new Date(j.createdAt),
        },
        now,
      ),
    );
  }
  return queueOrder(jobs, now, (j) => roi.get(j.id)?.score ?? 0).map((j) => ({ ...j, roi: roi.get(j.id)! }));
}
