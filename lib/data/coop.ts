import { prisma } from "@/lib/db";
import type { CoopPosting, SavedItem } from "@/lib/generated/prisma/client";

export type CoopPostingView = CoopPosting & { saved: SavedItem | null };

export type CoopSort = "deadline" | "recent";

export async function listPostings(opts: { showClosed?: boolean; sort?: CoopSort } = {}): Promise<CoopPostingView[]> {
  const { showClosed = false, sort = "recent" } = opts;

  const postings = await prisma.coopPosting.findMany({
    where: showClosed
      ? undefined
      : {
          NOT: { status: "closed", dismissedAt: { not: null } },
        },
    include: { saved: true },
    orderBy: sort === "recent" ? { firstSeenAt: "desc" } : undefined,
  });

  if (sort === "deadline") {
    postings.sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.firstSeenAt.getTime() - a.firstSeenAt.getTime();
    });
  }

  return postings;
}

export function getPosting(id: string) {
  return prisma.coopPosting.findUnique({ where: { id }, include: { saved: true } });
}

export function isNewPosting(posting: CoopPosting, now: Date = new Date()): boolean {
  if (posting.origin !== "fetched") return false;
  return now.getTime() - posting.firstSeenAt.getTime() < 72 * 60 * 60 * 1000;
}

export function isPossiblyClosed(posting: CoopPosting): boolean {
  return posting.disappearedAt != null && posting.dismissedAt == null;
}
