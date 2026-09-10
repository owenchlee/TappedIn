import { prisma } from "@/lib/db";
import { shouldMarkDisappeared, type DiffResult } from "@/lib/sources/diff";

export async function applyDiff(params: {
  sourceKey: string;
  companyName: string;
  diff: DiffResult;
  existingDisappearedAt: Map<string, Date | null>;
}): Promise<{ created: number; touched: number; missed: number }> {
  const { sourceKey, companyName, diff, existingDisappearedAt } = params;
  const now = new Date();

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
    ...(diff.toTouch.length > 0
      ? [
          prisma.coopPosting.updateMany({
            where: { id: { in: diff.toTouch.map((t) => t.id) } },
            data: { lastSeenAt: now, missCount: 0, disappearedAt: null },
          }),
        ]
      : []),
    ...diff.toMiss.map((m) => {
      const alreadyFlagged = existingDisappearedAt.get(m.id) != null;
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
