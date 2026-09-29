import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/data/settings";
import type { NavCounts } from "@/components/shell/AppShell";
import { ACTIVE_STAGES } from "@/lib/types";

const DAY = 86_400_000;

export async function jobsSeenAt(): Promise<Date> {
  const raw = await getSetting("jobsSeenAt");
  const parsed = raw ? new Date(raw) : null;
  // First visit ever: treat the last 3 days as "new" rather than every posting ever fetched.
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() - 3 * DAY);
}

export async function getNavCounts(): Promise<NavCounts> {
  const now = new Date();
  const endOfToday = new Date(now.getTime() + DAY);
  const seenAt = await jobsSeenAt();

  const [newJobs, dueSoon, nextSteps] = await Promise.all([
    prisma.coopPosting.count({ where: { duplicateOfId: null, firstSeenAt: { gt: seenAt }, status: { not: "closed" } } }),
    prisma.savedItem.count({
      where: {
        status: { in: [...ACTIVE_STAGES] },
        OR: [
          { coopPosting: { deadline: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 7 * DAY) } } },
          { organization: { deadline: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 7 * DAY) } } },
        ],
      },
    }),
    prisma.savedItem.count({ where: { status: { in: [...ACTIVE_STAGES] }, nextStepAt: { lte: endOfToday } } }),
  ]);
  return { newJobs, dueSoon, actionable: nextSteps };
}
