import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/data/settings";
import { externalKeyFor, urlKeyFor } from "@/lib/sources/normalize";

// Bump when externalKeyFor / urlKeyFor change, so stored keys are recomputed once per database.
// v2 (2026-10-03): job-ID query params (?gh_jid=, ?token=, ?job=) became part of the keys.
export const KEY_VERSION = "2";
const SETTING = "posting-key-version";

/**
 * Recomputes every stored posting's keys from its own url + role, in place, so a key change doesn't
 * churn rows (old rows "missed", new ones created, saved applications stranded on the old ones).
 * Fetched rows were created with externalKey = externalKeyFor(url, title) and role = title, so this
 * reproduces exactly what the next fetch will compute. Also un-hides same-source "duplicates" that
 * the old keys merged by mistake (two Stripe jobs on /jobs/search?gh_jid=...).
 */
export async function rekeyPostingsIfNeeded(): Promise<{ rekeyed: number; unhidden: number } | null> {
  if ((await getSetting(SETTING)) === KEY_VERSION) return null;

  const rows = await prisma.coopPosting.findMany({
    select: { id: true, url: true, role: true, origin: true, sourceKey: true, externalKey: true, urlKey: true, duplicateOfId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const next = new Map(
    rows.map((r) => [r.id, { urlKey: urlKeyFor(r.url), externalKey: r.origin === "fetched" && r.externalKey ? externalKeyFor(r.url, r.role) : r.externalKey }]),
  );

  const ops: (() => Promise<unknown>)[] = [];
  let rekeyed = 0;
  let unhidden = 0;
  for (const r of rows) {
    const n = next.get(r.id)!;
    const canonical = r.duplicateOfId ? byId.get(r.duplicateOfId) : undefined;
    // Same source + different job URL under the new keys = it was never a duplicate.
    const wrongDuplicate =
      canonical != null && canonical.sourceKey === r.sourceKey && n.urlKey != null && n.urlKey !== next.get(canonical.id)!.urlKey;
    if (n.urlKey === r.urlKey && n.externalKey === r.externalKey && !wrongDuplicate) continue;
    rekeyed++;
    if (wrongDuplicate) unhidden++;
    ops.push(() =>
      prisma.coopPosting.update({
        where: { id: r.id },
        data: { urlKey: n.urlKey, externalKey: n.externalKey, ...(wrongDuplicate ? { duplicateOfId: null } : {}) },
      }),
    );
  }
  // Finer keys never merge two previously distinct keys, so the (sourceKey, externalKey) unique
  // constraint can't trip. One update at a time (no long transaction to time out): it's idempotent,
  // so if it stops halfway the next refresh simply finishes it before the version is recorded.
  for (const op of ops) await op();
  await setSetting(SETTING, KEY_VERSION);
  return { rekeyed, unhidden };
}
