import { prisma } from "@/lib/db";
import { shouldMarkDisappeared, type DiffCreate, type DiffResult } from "@/lib/sources/diff";
import { titleKeyFor, urlKeyFor } from "@/lib/sources/normalize";

export type ExistingPostingMeta = { disappearedAt: Date | null; dismissedAt: Date | null };

type Keyed = DiffCreate & { company: string; urlKey: string | null; titleKey: string };

/**
 * Finds, for each new posting, an existing canonical row that is the same job — listed by a different
 * source, or added by hand. URL matches count from any source; company+title matches only count across
 * sources, since one company board listing the same title twice is usually two locations.
 */
async function findCanonicals(sourceKey: string, keyed: Keyed[]): Promise<Map<Keyed, string>> {
  const urlKeys = [...new Set(keyed.map((k) => k.urlKey).filter((k): k is string => k != null))];
  const titleKeys = [...new Set(keyed.map((k) => k.titleKey))];
  if (urlKeys.length === 0 && titleKeys.length === 0) return new Map();

  const candidates = await prisma.coopPosting.findMany({
    where: {
      duplicateOfId: null,
      OR: [{ urlKey: { in: urlKeys } }, { titleKey: { in: titleKeys } }],
    },
    select: { id: true, urlKey: true, titleKey: true, sourceKey: true },
    orderBy: { firstSeenAt: "asc" },
  });

  const byUrl = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const c of candidates) {
    if (c.urlKey && !byUrl.has(c.urlKey)) byUrl.set(c.urlKey, c.id);
    if (c.titleKey && c.sourceKey !== sourceKey && !byTitle.has(c.titleKey)) byTitle.set(c.titleKey, c.id);
  }

  const out = new Map<Keyed, string>();
  for (const k of keyed) {
    const match = (k.urlKey && byUrl.get(k.urlKey)) || byTitle.get(k.titleKey);
    if (match) out.set(k, match);
  }
  return out;
}

function rowFor(sourceKey: string, k: Keyed, now: Date, duplicateOfId: string | null, backfill: boolean) {
  // A brand-new source's whole backlog arrives at once; dating it by when each job was posted keeps
  // "Newest" meaningful and stops a new source from flooding "new since your last visit".
  const firstSeenAt = backfill && k.postedAt && k.postedAt < now ? k.postedAt : now;
  return {
    company: k.company,
    role: k.title,
    url: k.url,
    location: k.location ?? null,
    deadline: k.deadline ?? null,
    origin: "fetched",
    status: "open",
    sourceKey,
    externalKey: k.externalKey,
    terms: k.terms ?? [],
    category: k.category ?? null,
    region: k.region ?? null,
    postedAt: k.postedAt ?? null,
    urlKey: k.urlKey,
    titleKey: k.titleKey,
    duplicateOfId,
    firstSeenAt,
    lastSeenAt: now,
  };
}

export async function applyDiff(params: {
  sourceKey: string;
  companyName: string;
  diff: DiffResult;
  existingMeta: Map<string, ExistingPostingMeta>;
}): Promise<{ created: number; touched: number; missed: number; duplicates: number }> {
  const { sourceKey, companyName, diff, existingMeta } = params;
  const now = new Date();
  const backfill = existingMeta.size === 0;

  // --- creates, collapsed onto canonical rows where the same job already exists -----------------
  const keyed: Keyed[] = diff.toCreate.map((p) => {
    const company = p.company ?? companyName;
    return { ...p, company, urlKey: urlKeyFor(p.url), titleKey: titleKeyFor(company, p.title) };
  });
  const canonicalOf = await findCanonicals(sourceKey, keyed);

  const fresh: Keyed[] = [];
  const dupes: { k: Keyed; of: string | Keyed }[] = [];
  const freshByUrl = new Map<string, Keyed>();
  for (const k of keyed) {
    const existing = canonicalOf.get(k);
    if (existing) {
      dupes.push({ k, of: existing });
      continue;
    }
    // Same job twice within this one fetch (e.g. listed under two categories).
    const inBatch = k.urlKey ? freshByUrl.get(k.urlKey) : undefined;
    if (inBatch) {
      dupes.push({ k, of: inBatch });
      continue;
    }
    fresh.push(k);
    if (k.urlKey) freshByUrl.set(k.urlKey, k);
  }

  let created = 0;
  if (fresh.length > 0) {
    const rows = await prisma.coopPosting.createManyAndReturn({
      data: fresh.map((k) => rowFor(sourceKey, k, now, null, backfill)),
      select: { id: true, externalKey: true },
      skipDuplicates: true,
    });
    created = rows.length;
    const idByExternal = new Map(rows.map((r) => [r.externalKey, r.id]));
    const dupeRows = dupes
      .map(({ k, of }) => {
        const target = typeof of === "string" ? of : idByExternal.get(of.externalKey);
        return target ? rowFor(sourceKey, k, now, target, backfill) : null;
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (dupeRows.length > 0) await prisma.coopPosting.createMany({ data: dupeRows, skipDuplicates: true });
  } else if (dupes.length > 0) {
    await prisma.coopPosting.createMany({
      data: dupes.filter((d) => typeof d.of === "string").map(({ k, of }) => rowFor(sourceKey, k, now, of as string, backfill)),
      skipDuplicates: true,
    });
  }

  // --- touches ----------------------------------------------------------------------------------
  // A touched posting was still present in the fetch. If it had been auto-flagged as possibly closed
  // (disappearedAt set) and the user never confirmed that closure (dismissedAt null), reappearing
  // restores status "open" — otherwise it would stay "closed" with no banner left to resolve it from.
  // A posting the user explicitly confirmed closed keeps that judgment even if the source lists it again.
  const touchReopen: string[] = [];
  const touchKeepStatus: string[] = [];
  for (const t of diff.toTouch) {
    const meta = existingMeta.get(t.id);
    if (meta?.disappearedAt != null && meta.dismissedAt == null) touchReopen.push(t.id);
    else touchKeepStatus.push(t.id);
  }

  // --- misses, grouped so a thousand-row source is a handful of statements, not a thousand ------
  const missGroups = new Map<string, string[]>();
  for (const m of diff.toMiss) {
    const alreadyFlagged = existingMeta.get(m.id)?.disappearedAt != null;
    const flagNow = shouldMarkDisappeared(m.missCount) && !alreadyFlagged;
    const key = `${m.missCount}|${flagNow ? 1 : 0}`;
    missGroups.set(key, [...(missGroups.get(key) ?? []), m.id]);
  }

  const ops = [
    ...(touchReopen.length > 0
      ? [
          prisma.coopPosting.updateMany({
            where: { id: { in: touchReopen } },
            data: { lastSeenAt: now, missCount: 0, disappearedAt: null, status: "open" },
          }),
        ]
      : []),
    ...(touchKeepStatus.length > 0
      ? [
          prisma.coopPosting.updateMany({
            where: { id: { in: touchKeepStatus } },
            data: { lastSeenAt: now, missCount: 0, disappearedAt: null },
          }),
        ]
      : []),
    ...[...missGroups].map(([key, ids]) => {
      const [missCount, flag] = key.split("|");
      return prisma.coopPosting.updateMany({
        where: { id: { in: ids } },
        data: { missCount: Number(missCount), ...(flag === "1" ? { disappearedAt: now, status: "closed" } : {}) },
      });
    }),
  ];
  if (ops.length > 0) await prisma.$transaction(ops);

  return { created, touched: diff.toTouch.length, missed: diff.toMiss.length, duplicates: dupes.length };
}
