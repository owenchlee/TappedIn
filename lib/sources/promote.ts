import { prisma } from "@/lib/db";
import { loadedSourceFromRow } from "@/lib/sources/load";

/**
 * A job listed by two sources is stored once: the first source's row is canonical, the others are
 * hidden duplicates pointing at it. When the canonical's source stops listing the job (the Canadian
 * list drops it), the canonical is flagged closed after two misses, and the job vanished from the
 * Jobs page even though another source (SimplifyJobs) still lists it as open.
 *
 * This promotes the live duplicate to canonical, re-points the rest of the group at it, and moves
 * any tracked application across. A duplicate only counts as live when:
 *  - its source was seen listing it AFTER the canonical's source last did, and
 *  - its source drops closed jobs. Lists marked `keepsClosedJobs` in data/company-sources.json
 *    (vanshb03 lags SimplifyJobs by days) aren't trusted to say a job is still open.
 * A closure Owen confirmed himself (dismissedAt) is never undone.
 */
const LATER_RUN_MS = 60 * 60 * 1000;

type Seen = { lastSeenAt: Date | null };

/**
 * The duplicate that proves the job is still open, if any. "Later" means a later refresh, not
 * seconds later in the same run (sources run one after another), which also rules out a source
 * whose fetches have been failing since.
 */
export function liveDuplicate<D extends Seen & { sourceKey: string | null }>(old: Seen, duplicates: D[], untrusted: Set<string>): D | null {
  return (
    duplicates.find(
      (d) =>
        d.sourceKey != null &&
        !untrusted.has(d.sourceKey) &&
        d.lastSeenAt != null &&
        (old.lastSeenAt == null || d.lastSeenAt.getTime() - old.lastSeenAt.getTime() > LATER_RUN_MS),
    ) ?? null
  );
}

export async function promoteLiveDuplicates(): Promise<number> {
  const sources = await prisma.companySource.findMany();
  const untrusted = new Set(sources.filter((s) => loadedSourceFromRow(s).config.keepsClosedJobs === true).map((s) => s.key));

  const stranded = await prisma.coopPosting.findMany({
    where: { duplicateOfId: null, status: "closed", disappearedAt: { not: null }, dismissedAt: null, duplicates: { some: { status: "open" } } },
    select: {
      id: true,
      lastSeenAt: true,
      saved: { select: { id: true } },
      duplicates: { where: { status: "open" }, select: { id: true, sourceKey: true, lastSeenAt: true }, orderBy: { lastSeenAt: "desc" } },
    },
  });

  let promoted = 0;
  for (const old of stranded) {
    const live = liveDuplicate(old, old.duplicates, untrusted);
    if (!live) continue;
    await prisma.$transaction([
      prisma.coopPosting.update({ where: { id: live.id }, data: { duplicateOfId: null } }),
      prisma.coopPosting.updateMany({ where: { duplicateOfId: old.id, id: { not: live.id } }, data: { duplicateOfId: live.id } }),
      prisma.coopPosting.update({ where: { id: old.id }, data: { duplicateOfId: live.id } }),
      // The application follows the job, so it stays visible and open.
      ...(old.saved ? [prisma.savedItem.update({ where: { id: old.saved.id }, data: { coopPostingId: live.id } })] : []),
    ]);
    promoted++;
  }
  return promoted;
}
