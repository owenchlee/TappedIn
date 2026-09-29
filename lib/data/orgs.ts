import { prisma } from "@/lib/db";
import type { Organization, Prisma, SavedItem } from "@/lib/generated/prisma/client";
import { isPastDate } from "@/lib/deadline";
import type { HackathonRegion, OrgKind } from "@/lib/types";

export type OrgView = Organization & { saved: SavedItem | null };

/**
 * Whether you can still apply: not marked closed, deadline not passed, and the event hasn't started —
 * unless the daily watcher spotted a new cycle after that event, in which case it's back in play.
 */
export function isOrgApplicable(
  org: Pick<Organization, "applicationStatus" | "deadline" | "eventStart" | "eventEnd"> &
    Partial<Pick<Organization, "signalAt">>,
  now: Date = new Date(),
): boolean {
  if (org.applicationStatus === "closed") return false;
  if (isPastDate(org.deadline, now)) return false;
  const eventDate = org.eventStart ?? org.eventEnd;
  if (!isPastDate(eventDate, now)) return true;
  return org.signalAt != null && eventDate != null && org.signalAt > eventDate;
}

/** Watcher alerts you haven't dismissed yet — the home page's "Heads up" list. */
export function listUnseenSignals(): Promise<OrgView[]> {
  return prisma.organization.findMany({
    where: { signalAt: { not: null }, signalSeenAt: null },
    include: { saved: true },
    orderBy: { signalAt: "desc" },
  });
}

export async function listOrgs(
  kind: OrgKind,
  opts: { includePast?: boolean; regions?: HackathonRegion[] } = {},
): Promise<{ orgs: OrgView[]; hiddenCount: number }> {
  const where: Prisma.OrganizationWhereInput = { kind };
  if (kind === "hackathon" && opts.regions && opts.regions.length > 0) {
    // Hand-curated hackathons are all within driving range, so they count as "nearby".
    where.OR = [{ region: { in: opts.regions } }, ...(opts.regions.includes("nearby") ? [{ origin: "seed" }] : [])];
  }
  const all = await prisma.organization.findMany({
    where,
    include: { saved: true },
    orderBy:
      kind === "hackathon"
        ? [{ eventStart: { sort: "asc", nulls: "last" } }, { name: "asc" }]
        : [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (opts.includePast) return { orgs: all, hiddenCount: 0 };
  const orgs = all.filter((o) => isOrgApplicable(o));
  return { orgs, hiddenCount: all.length - orgs.length };
}

export function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}
