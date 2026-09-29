import { prisma } from "@/lib/db";
import type { SavedCategory, SavedStatus } from "@/lib/types";

export type SavedItemView = {
  savedId: string;
  category: SavedCategory;
  status: SavedStatus;
  pinned: boolean;
  updatedAt: Date;
  entityKind: "coop" | "org";
  entityId: string;
  title: string;
  subtitle: string;
  url: string;
  deadline: Date | null;
  notes: string;
};

export type SavedSort = "deadline" | "status" | "recent";

export async function listSavedItems(sort: SavedSort = "recent"): Promise<SavedItemView[]> {
  const items = await prisma.savedItem.findMany({ include: { coopPosting: true, organization: true } });

  const mapped: SavedItemView[] = [];
  for (const item of items) {
    if (item.coopPosting) {
      mapped.push({
        savedId: item.id,
        category: item.category as SavedCategory,
        status: item.status as SavedStatus,
        pinned: item.pinned,
        updatedAt: item.updatedAt,
        entityKind: "coop",
        entityId: item.coopPosting.id,
        title: item.coopPosting.role,
        subtitle: item.coopPosting.company,
        url: item.coopPosting.url,
        deadline: item.coopPosting.deadline,
        notes: item.coopPosting.notes,
      });
    } else if (item.organization) {
      mapped.push({
        savedId: item.id,
        category: item.category as SavedCategory,
        status: item.status as SavedStatus,
        pinned: item.pinned,
        updatedAt: item.updatedAt,
        entityKind: "org",
        entityId: item.organization.id,
        title: item.organization.name,
        subtitle:
          item.organization.kind === "design_team"
            ? "Design team"
            : item.organization.kind === "club"
              ? "Club"
              : "Hackathon",
        url: item.organization.url,
        deadline: item.organization.deadline,
        notes: item.organization.notes,
      });
    }
  }

  if (sort === "deadline") {
    mapped.sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  } else if (sort === "status") {
    mapped.sort((a, b) => a.status.localeCompare(b.status) || b.updatedAt.getTime() - a.updatedAt.getTime());
  } else {
    mapped.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  return mapped;
}
