import { prisma } from "@/lib/db";
import { isOrgApplicable } from "@/lib/data/orgs";
import { ACTIVE_STAGES } from "@/lib/types";
import { notBlocked } from "@/lib/data/jobs";

const DAY = 86_400_000;

export type TodayStats = {
  active: number;
  applied30d: number;
  interviewsAhead: number;
  offers: number;
  responseRate: number | null;
};

export async function getTodayStats(now: Date = new Date()): Promise<TodayStats> {
  const [active, applied30d, interviewsAhead, offers, appliedEver, heardBack] = await Promise.all([
    prisma.savedItem.count({ where: { status: { in: [...ACTIVE_STAGES].filter((s) => s !== "interested") } } }),
    prisma.savedItem.count({ where: { appliedAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.applicationEvent.count({ where: { type: { in: ["interview", "oa"] }, at: { gte: now, lte: new Date(now.getTime() + 14 * DAY) } } }),
    prisma.savedItem.count({ where: { status: "offer" } }),
    prisma.savedItem.count({ where: { category: "coop", appliedAt: { not: null } } }),
    prisma.savedItem.count({
      where: { category: "coop", appliedAt: { not: null }, status: { in: ["oa", "interview", "offer", "accepted"] } },
    }),
  ]);
  return {
    active,
    applied30d,
    interviewsAhead,
    offers,
    responseRate: appliedEver >= 5 ? heardBack / appliedEver : null,
  };
}

/** Applications that have sat in "applied" for 3+ weeks with no movement — likely ghosted. */
export async function getStaleApplications(now: Date = new Date()) {
  return prisma.savedItem.findMany({
    where: { status: "applied", statusChangedAt: { lt: new Date(now.getTime() - 21 * DAY) } },
    include: { coopPosting: true, organization: true },
    orderBy: { statusChangedAt: "asc" },
    take: 5,
  });
}

/** Good matches you haven't acted on whose deadline is within the week, soonest first. */
export async function getClosingSoon(now: Date = new Date(), limit = 6) {
  return prisma.coopPosting.findMany({
    where: {
      AND: [
        { duplicateOfId: null, saved: null, status: { not: "closed" }, fitScore: { gte: 55 } },
        { deadline: { gte: new Date(now.getTime() - DAY / 2), lte: new Date(now.getTime() + 7 * DAY) } },
        notBlocked,
      ],
    },
    orderBy: [{ deadline: "asc" }, { fitScore: "desc" }],
    take: limit,
  });
}

/**
 * The best-scoring jobs you haven't saved or applied to yet, from anywhere you'd work. The Jobs page
 * has the full ranked list; this is the short version for the morning.
 */
export async function getTopMatches(limit = 6) {
  return prisma.coopPosting.findMany({
    where: {
      AND: [
        { duplicateOfId: null, saved: null, status: { not: "closed" }, fitScore: { gte: 50 } },
        { OR: [{ deadline: null }, { deadline: { gte: new Date(Date.now() - DAY / 2) } }] },
        notBlocked,
      ],
    },
    orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }],
    take: limit,
  });
}

/** Design teams and clubs currently taking applications, and hackathons coming up nearby. */
export async function getOpenOpportunities(now: Date = new Date()) {
  const [orgs, hackathons] = await Promise.all([
    prisma.organization.findMany({
      where: { kind: { in: ["design_team", "club"] }, OR: [{ applicationStatus: { in: ["open", "rolling"] } }, { watchLevel: "open" }] },
      include: { saved: true },
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
    }),
    prisma.organization.findMany({
      where: { kind: "hackathon", eventStart: { gte: now }, OR: [{ region: { in: ["nearby", "online"] } }, { origin: "seed" }] },
      include: { saved: true },
      orderBy: { eventStart: "asc" },
      take: 4,
    }),
  ]);
  return { orgs: orgs.filter((o) => isOrgApplicable(o, now)).slice(0, 6), hackathons };
}
