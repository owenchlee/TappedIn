import { prisma } from "@/lib/db";
import { isOrgApplicable } from "@/lib/data/orgs";
import { ACTIVE_STAGES, EVENT_LABELS, type EventType } from "@/lib/types";

export type AgendaKind = "interview" | "oa" | "offer" | "follow_up" | "note" | "deadline" | "next_step" | "hackathon" | "org_deadline" | "contact";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  at: Date;
  /** Date-only items are stored at 12:00 UTC and shouldn't show a time. */
  allDay: boolean;
  end?: Date | null;
  title: string;
  subtitle: string;
  href: string;
  logoName?: string;
  logoUrl?: string;
};

const DAY = 86_400_000;

function isAllDay(d: Date) {
  return d.getUTCHours() === 12 && d.getUTCMinutes() === 0;
}

/** Everything with a date between `from` and `to`: interviews, OAs, deadlines, next steps, hackathons, follow-ups. */
export async function getAgenda(from: Date, to: Date): Promise<AgendaItem[]> {
  const [events, deadlineApps, nextSteps, hackathons, orgDeadlines, contacts] = await Promise.all([
    prisma.applicationEvent.findMany({
      where: { type: { not: "stage" }, at: { gte: from, lte: to } },
      include: { savedItem: { include: { coopPosting: true, organization: true } } },
    }),
    // "Apply by" deadlines only matter until you've applied.
    prisma.savedItem.findMany({
      where: {
        status: "interested",
        OR: [{ coopPosting: { deadline: { gte: from, lte: to } } }, { organization: { deadline: { gte: from, lte: to } } }],
      },
      include: { coopPosting: true, organization: true },
    }),
    prisma.savedItem.findMany({
      where: { status: { in: [...ACTIVE_STAGES] }, nextStepAt: { gte: from, lte: to }, nextStep: { not: "" } },
      include: { coopPosting: true, organization: true },
    }),
    prisma.organization.findMany({
      where: {
        kind: "hackathon",
        eventStart: { gte: from, lte: to },
        OR: [{ saved: { isNot: null } }, { origin: "seed" }, { region: "nearby" }],
      },
      include: { saved: true },
    }),
    prisma.organization.findMany({
      where: { kind: { in: ["design_team", "club"] }, deadline: { gte: from, lte: to }, saved: null },
    }),
    prisma.contact.findMany({ where: { followUpAt: { gte: from, lte: to } } }),
  ]);

  const items: AgendaItem[] = [];

  for (const e of events) {
    const s = e.savedItem;
    const name = s.coopPosting?.company ?? s.organization?.name ?? "";
    items.push({
      id: `ev-${e.id}`,
      kind: (["interview", "oa", "offer", "follow_up", "note"].includes(e.type) ? e.type : "note") as AgendaKind,
      at: e.at,
      allDay: isAllDay(e.at),
      title: e.title || `${EVENT_LABELS[e.type as EventType] ?? "Event"}`,
      subtitle: [name, s.coopPosting?.role].filter(Boolean).join(" · "),
      href: `/applications/${s.id}`,
      logoName: name,
      logoUrl: s.coopPosting?.url ?? s.organization?.url,
    });
  }

  for (const s of deadlineApps) {
    const deadline = s.coopPosting?.deadline ?? s.organization?.deadline;
    if (!deadline) continue;
    const name = s.coopPosting?.company ?? s.organization?.name ?? "";
    items.push({
      id: `dl-${s.id}`,
      kind: "deadline",
      at: deadline,
      allDay: true,
      title: `Apply: ${s.coopPosting?.role ?? s.organization?.name}`,
      subtitle: s.coopPosting ? name : "Application deadline",
      href: `/applications/${s.id}`,
      logoName: name,
      logoUrl: s.coopPosting?.url ?? s.organization?.url,
    });
  }

  for (const s of nextSteps) {
    const name = s.coopPosting?.company ?? s.organization?.name ?? "";
    items.push({
      id: `ns-${s.id}`,
      kind: "next_step",
      at: s.nextStepAt!,
      allDay: true,
      title: s.nextStep,
      subtitle: [name, s.coopPosting?.role].filter(Boolean).join(" · "),
      href: `/applications/${s.id}`,
      logoName: name,
      logoUrl: s.coopPosting?.url ?? s.organization?.url,
    });
  }

  for (const h of hackathons) {
    items.push({
      id: `hk-${h.id}`,
      kind: "hackathon",
      at: h.eventStart!,
      end: h.eventEnd,
      allDay: true,
      title: h.name,
      subtitle: [h.location ?? "Hackathon", h.saved ? "tracking" : null].filter(Boolean).join(" · "),
      href: h.saved ? `/applications/${h.saved.id}` : "/hackathons",
      logoName: h.name,
      logoUrl: h.url,
    });
  }

  for (const o of orgDeadlines) {
    if (!isOrgApplicable(o)) continue;
    items.push({
      id: `od-${o.id}`,
      kind: "org_deadline",
      at: o.deadline!,
      allDay: true,
      title: `${o.name} applications close`,
      subtitle: o.kind === "design_team" ? "Design team" : "Club",
      href: o.kind === "design_team" ? "/design-teams" : "/clubs",
      logoName: o.name,
      logoUrl: o.url,
    });
  }

  for (const c of contacts) {
    items.push({
      id: `ct-${c.id}`,
      kind: "contact",
      at: c.followUpAt!,
      allDay: true,
      title: `Follow up with ${c.name}`,
      subtitle: [c.role, c.company].filter(Boolean).join(" · "),
      href: `/contacts#${c.id}`,
    });
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Overdue items worth surfacing on Today: next steps and follow-ups whose date has passed. */
export async function getOverdue(now: Date = new Date()): Promise<AgendaItem[]> {
  const items = await getAgenda(new Date(now.getTime() - 60 * DAY), new Date(now.getTime() - DAY / 2));
  return items.filter((i) => i.kind === "next_step" || i.kind === "contact");
}
