import { prisma } from "@/lib/db";
import type { Organization, SavedItem } from "@/lib/generated/prisma/client";
import type { OrgKind } from "@/lib/types";

export type OrgView = Organization & { saved: SavedItem | null };

export function listOrgs(kind: OrgKind): Promise<OrgView[]> {
  return prisma.organization.findMany({
    where: { kind },
    include: { saved: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}
