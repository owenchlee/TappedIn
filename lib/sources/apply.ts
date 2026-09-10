import { prisma } from "@/lib/db";
import { shouldMarkDisappeared, type DiffResult } from "@/lib/sources/diff";

export type ExistingPostingMeta = { disappearedAt: Date | null; dismissedAt: Date | null };

export async function applyDiff(params: {
  sourceKey: string;
  companyName: string;
  diff: DiffResult;
  existingMeta: Map<string, ExistingPostingMeta>;
}): Promise<{ created: number; touched: number; missed: number }> {
  const { sourceKey, companyName, diff, existingMeta } = params;
  const now = new Date();

  // A touched posting was still present in the fetch. If it had been auto-flagged as possibly
  // closed (disappearedAt set) and the user never confirmed that closure (dismissedAt null),
  // reappearing should also restore status: "open" — otherwise it stays permanently "closed"
  // with no "possibly closed" banner left to resolve it from. A posting the user explicitly
  // confirmed closed (dismissedAt set) keeps that judgment even if the source lists it again.
  const touchReopen: string[] = [];
  const touchKeepStatus: string[] = [];
  for (const t of diff.toTouch) {
    const meta = existingMeta.get(t.id);
    if (meta?.disappearedAt != null && meta.dismissedAt == null) {
      touchReopen.push(t.id);
    } else {
      touchKeepStatus.push(t.id);
    }
  }

  const ops = [
    ...diff.toCreate.map((posting) =>
      prisma.coopPosting.create({
        data: {
          company: companyName,
          role: posting.title,
          url: posting.url,
          location: posting.location ?? null,
          deadline: posting.deadline ?? null,
          origin: "fetched",
          status: "open",
          sourceKey,
          externalKey: posting.externalKey,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      }),
    ),
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
    ...diff.toMiss.map((m) => {
      const alreadyFlagged = existingMeta.get(m.id)?.disappearedAt != null;
      const nowFlagged = shouldMarkDisappeared(m.missCount);
      return prisma.coopPosting.update({
        where: { id: m.id },
        data: {
          missCount: m.missCount,
          ...(nowFlagged && !alreadyFlagged ? { disappearedAt: now, status: "closed" } : {}),
        },
      });
    }),
  ];

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  return { created: diff.toCreate.length, touched: diff.toTouch.length, missed: diff.toMiss.length };
}
