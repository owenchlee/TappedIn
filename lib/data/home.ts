import { prisma } from "@/lib/db";
import { isNewPosting } from "@/lib/data/coop";
import { urgencyOf } from "@/lib/deadline";
import type { SavedCategory } from "@/lib/types";

export type Stats = { openCount: number; savedCount: number; dueSoonCount: number };

export async function getStats(): Promise<Stats> {
  const [postings, orgs, savedCount] = await Promise.all([
    prisma.coopPosting.findMany({ select: { status: true, deadline: true } }),
    prisma.organization.findMany({ select: { applicationStatus: true, deadline: true } }),
    prisma.savedItem.count(),
  ]);

  const dueSoon = (deadline: Date | null) => {
    if (!deadline) return false;
    const urgency = urgencyOf(deadline);
    return urgency === "today" || urgency === "urgent";
  };

  const openCount =
    postings.filter((p) => p.status === "open").length +
    orgs.filter((o) => o.applicationStatus === "open" || o.applicationStatus === "rolling").length;

  const dueSoonCount = postings.filter((p) => dueSoon(p.deadline)).length + orgs.filter((o) => dueSoon(o.deadline)).length;

  return { openCount, savedCount, dueSoonCount };
}

export type FeedItem = {
  kind: SavedCategory;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  deadline: Date | null;
  status: string;
  feedAt: Date;
  isNew: boolean;
  saved: boolean;
};

export async function getRecentFeed(limit = 20): Promise<FeedItem[]> {
  const [postings, orgs] = await Promise.all([
    prisma.coopPosting.findMany({ orderBy: { firstSeenAt: "desc" }, take: 30, include: { saved: true } }),
    prisma.organization.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { saved: true } }),
  ]);

  const postingItems: FeedItem[] = postings.map((p) => ({
    kind: "coop",
    id: p.id,
    title: p.role,
    subtitle: p.company,
    url: p.url,
    deadline: p.deadline,
    status: p.status,
    feedAt: p.firstSeenAt,
    isNew: isNewPosting(p),
    saved: Boolean(p.saved),
  }));

  const orgItems: FeedItem[] = orgs.map((o) => ({
    kind: o.kind as SavedCategory,
    id: o.id,
    title: o.name,
    subtitle: o.kind === "design_team" ? "Design team" : "Club",
    url: o.url,
    deadline: o.deadline,
    status: o.applicationStatus,
    feedAt: o.createdAt,
    isNew: false,
    saved: Boolean(o.saved),
  }));

  return [...postingItems, ...orgItems].sort((a, b) => b.feedAt.getTime() - a.feedAt.getTime()).slice(0, limit);
}

export type SavedQuickItem = {
  savedId: string;
  category: SavedCategory;
  status: string;
  pinned: boolean;
  title: string;
  subtitle: string;
  url: string;
  deadline: Date | null;
  updatedAt: Date;
};

export async function getSavedQuickAccess(limit = 8): Promise<SavedQuickItem[]> {
  const items = await prisma.savedItem.findMany({
    where: { status: { in: ["interested", "applied", "interview"] } },
    include: { coopPosting: true, organization: true },
  });

  const mapped: SavedQuickItem[] = [];
  for (const item of items) {
    if (item.coopPosting) {
      mapped.push({
        savedId: item.id,
        category: item.category as SavedCategory,
        status: item.status,
        pinned: item.pinned,
        title: item.coopPosting.role,
        subtitle: item.coopPosting.company,
        url: item.coopPosting.url,
        deadline: item.coopPosting.deadline,
        updatedAt: item.updatedAt,
      });
    } else if (item.organization) {
      mapped.push({
        savedId: item.id,
        category: item.category as SavedCategory,
        status: item.status,
        pinned: item.pinned,
        title: item.organization.name,
        subtitle: item.organization.kind === "design_team" ? "Design team" : "Club",
        url: item.organization.url,
        deadline: item.organization.deadline,
        updatedAt: item.updatedAt,
      });
    }
  }

  // Nulls-last deadline sort in JS — the SQLite connector doesn't support Prisma's `nulls: "last"`
  // ordering, and a plain ascending sort would push undated items to the top.
  mapped.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return mapped.slice(0, limit);
}
