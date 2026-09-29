import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SavedCategory, SavedStatus } from "@/lib/types";

const include = {
  coopPosting: true,
  organization: true,
  events: { orderBy: { at: "asc" } },
  _count: { select: { contacts: true } },
} satisfies Prisma.SavedItemInclude;

type Row = Prisma.SavedItemGetPayload<{ include: typeof include }>;

export type ApplicationView = {
  id: string;
  category: SavedCategory;
  status: SavedStatus;
  title: string;
  company: string;
  url: string;
  location: string | null;
  deadline: Date | null;
  eventStart: Date | null;
  term: string | null;
  channel: string | null;
  refId: string | null;
  resume: string | null;
  pay: string | null;
  nextStep: string;
  nextStepAt: Date | null;
  appliedAt: Date | null;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  notes: string;
  entityKind: "coop" | "org";
  entityId: string;
  upcoming: { type: string; title: string; at: Date } | null;
  contactCount: number;
};

const ORG_LABEL: Record<string, string> = { design_team: "Design team", club: "Club", hackathon: "Hackathon" };

export function toView(row: Row, now: Date = new Date()): ApplicationView | null {
  const upcomingEvent = row.events.find((e) => e.type !== "stage" && e.at.getTime() >= now.getTime() - 2 * 3_600_000) ?? null;
  const common = {
    id: row.id,
    category: row.category as SavedCategory,
    status: row.status as SavedStatus,
    term: row.term,
    channel: row.channel,
    refId: row.refId,
    resume: row.resume,
    pay: row.pay,
    nextStep: row.nextStep,
    nextStepAt: row.nextStepAt,
    appliedAt: row.appliedAt,
    statusChangedAt: row.statusChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    upcoming: upcomingEvent ? { type: upcomingEvent.type, title: upcomingEvent.title, at: upcomingEvent.at } : null,
    contactCount: row._count.contacts,
  };
  if (row.coopPosting) {
    const p = row.coopPosting;
    return {
      ...common,
      title: p.role,
      company: p.company,
      url: p.url,
      location: p.location,
      deadline: p.deadline,
      eventStart: null,
      notes: p.notes,
      entityKind: "coop",
      entityId: p.id,
    };
  }
  if (row.organization) {
    const o = row.organization;
    return {
      ...common,
      title: o.name,
      company: ORG_LABEL[o.kind] ?? "Organization",
      url: o.applyUrl ?? o.url,
      location: o.location,
      deadline: o.deadline,
      eventStart: o.eventStart,
      notes: o.notes,
      entityKind: "org",
      entityId: o.id,
    };
  }
  return null;
}

export type ApplicationFilters = { category?: SavedCategory | "all"; term?: string | "all"; q?: string };

export async function listApplications(filters: ApplicationFilters = {}): Promise<ApplicationView[]> {
  const where: Prisma.SavedItemWhereInput = {};
  if (filters.category && filters.category !== "all") where.category = filters.category;
  if (filters.term && filters.term !== "all") where.term = filters.term;
  const q = filters.q?.trim();
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    where.OR = [{ coopPosting: { OR: [{ company: contains }, { role: contains }] } }, { organization: { name: contains } }];
  }
  const rows = await prisma.savedItem.findMany({ where, include, orderBy: { statusChangedAt: "desc" } });
  const now = new Date();
  return rows.map((r) => toView(r, now)).filter((v): v is ApplicationView => v != null);
}

export async function getApplication(id: string) {
  const row = await prisma.savedItem.findUnique({
    where: { id },
    include: {
      ...include,
      contacts: { orderBy: { name: "asc" } },
      workTerm: true,
      coopPosting: { include: { duplicates: { select: { sourceKey: true, url: true } }, source: { select: { name: true } } } },
    },
  });
  if (!row) return null;
  const view = toView(row);
  if (!view) return null;
  return { view, row };
}

export async function listTermsInUse(): Promise<string[]> {
  const rows = await prisma.savedItem.findMany({ where: { term: { not: null } }, distinct: ["term"], select: { term: true } });
  return rows.map((r) => r.term!).filter(Boolean);
}
