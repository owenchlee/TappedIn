import { prisma } from "@/lib/db";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";
import { termSortKey } from "@/lib/terms";

const PIPELINE = ["interested", "applied", "oa", "interview", "offer", "accepted"] as const;
type Stage = (typeof PIPELINE)[number];

function rank(status: string | null | undefined): number {
  return PIPELINE.indexOf(status as Stage);
}

export type Insights = {
  funnel: { stage: Stage; label: string; count: number }[];
  weekly: { weekStart: Date; count: number }[];
  byChannel: { label: string; applied: number; responded: number }[];
  byResume: { label: string; applied: number; responded: number }[];
  byTerm: { term: string; applied: number; interviews: number; offers: number }[];
  outcomes: { rejected: number; ghosted: number; withdrawn: number };
  medianDaysToResponse: number | null;
};

const LABELS: Record<Stage, string> = {
  interested: "Saved",
  applied: "Applied",
  oa: "Online assessment",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
};

export async function getInsights(now: Date = new Date()): Promise<Insights> {
  const apps = await prisma.savedItem.findMany({
    where: { category: "coop" },
    include: { events: { where: { type: "stage" }, orderBy: { at: "asc" } } },
  });

  // Furthest pipeline stage each application ever reached (a rejection after an interview still
  // counts as "reached interview").
  const reached = apps.map((a) => {
    let best = rank(a.status);
    for (const e of a.events) best = Math.max(best, rank(e.toStatus));
    if (best < rank("applied") && a.appliedAt) best = rank("applied");
    return { app: a, best };
  });

  const funnel = PIPELINE.slice(1).map((stage) => ({
    stage,
    label: LABELS[stage],
    count: reached.filter((r) => r.best >= rank(stage)).length,
  }));

  const responded = (r: (typeof reached)[number]) => r.best >= rank("oa");
  const applied = reached.filter((r) => r.best >= rank("applied"));

  // Weekly volume for the last 16 weeks (weeks start Monday).
  const weekly: { weekStart: Date; count: number }[] = [];
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (let i = 15; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    weekly.push({ weekStart: start, count: apps.filter((a) => a.appliedAt && a.appliedAt >= start && a.appliedAt < end).length });
  }

  const group = (key: (r: (typeof reached)[number]) => string | null) => {
    const map = new Map<string, { applied: number; responded: number }>();
    for (const r of applied) {
      const k = key(r) ?? "Unspecified";
      const cur = map.get(k) ?? { applied: 0, responded: 0 };
      cur.applied++;
      if (responded(r)) cur.responded++;
      map.set(k, cur);
    }
    return [...map].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.applied - a.applied);
  };

  const termMap = new Map<string, { applied: number; interviews: number; offers: number }>();
  for (const r of applied) {
    if (!r.app.term) continue;
    const cur = termMap.get(r.app.term) ?? { applied: 0, interviews: 0, offers: 0 };
    cur.applied++;
    if (r.best >= rank("interview")) cur.interviews++;
    if (r.best >= rank("offer")) cur.offers++;
    termMap.set(r.app.term, cur);
  }

  // Days from applying to the first OA/interview.
  const waits: number[] = [];
  for (const r of applied) {
    const appliedAt = r.app.appliedAt;
    const firstResponse = r.app.events.find((e) => rank(e.toStatus) >= rank("oa"));
    if (appliedAt && firstResponse) waits.push((firstResponse.at.getTime() - appliedAt.getTime()) / 86_400_000);
  }
  waits.sort((a, b) => a - b);

  return {
    funnel,
    weekly,
    byChannel: group((r) => (r.app.channel ? CHANNEL_LABELS[r.app.channel as Channel] : null)),
    byResume: group((r) => r.app.resume),
    byTerm: [...termMap].map(([term, v]) => ({ term, ...v })).sort((a, b) => termSortKey(b.term) - termSortKey(a.term)),
    outcomes: {
      rejected: apps.filter((a) => a.status === "rejected").length,
      ghosted: apps.filter((a) => a.status === "ghosted").length,
      withdrawn: apps.filter((a) => a.status === "withdrawn").length,
    },
    medianDaysToResponse: waits.length ? Math.round(waits[Math.floor(waits.length / 2)]) : null,
  };
}
