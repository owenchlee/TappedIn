import { prisma } from "@/lib/db";
import type { CoopPosting, SavedItem } from "@/lib/generated/prisma/client";
import { isPastDate } from "@/lib/deadline";

// `details` (the posting text) is omitted from every query by default; see lib/db.ts.
export type CoopPostingView = Omit<CoopPosting, "details"> & { saved: SavedItem | null };

export type CoopSort = "deadline" | "recent";

export async function listPostings(opts: { showClosed?: boolean; sort?: CoopSort } = {}): Promise<CoopPostingView[]> {
  const { showClosed = false, sort = "recent" } = opts;

  const all = await prisma.coopPosting.findMany({
    include: { saved: true },
    orderBy: sort === "recent" ? { firstSeenAt: "desc" } : undefined,
  });
  const postings = showClosed ? all : all.filter((p) => isPostingApplicable(p));

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

/** Same rule the co-op page uses by default: not a confirmed closure, and the deadline hasn't passed. */
export function isPostingApplicable(
  posting: Pick<CoopPosting, "status" | "dismissedAt" | "deadline">,
  now: Date = new Date(),
): boolean {
  if (posting.status === "closed" && posting.dismissedAt != null) return false;
  return !isPastDate(posting.deadline, now);
}

export function isPossiblyClosed(posting: CoopPosting): boolean {
  return posting.disappearedAt != null && posting.dismissedAt == null;
}
