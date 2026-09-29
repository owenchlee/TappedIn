"use server";

import { prisma } from "@/lib/db";

export type SearchResult = {
  id: string;
  kind: "application" | "job" | "hackathon" | "design_team" | "club" | "contact" | "page";
  title: string;
  subtitle: string;
  href: string;
  logoName?: string;
  logoUrl?: string;
};

const ORG_HREF = { hackathon: "/hackathons", design_team: "/design-teams", club: "/clubs" } as const;

export async function searchAll(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };

  const [applications, jobs, orgs, contacts] = await Promise.all([
    prisma.savedItem.findMany({
      where: { OR: [{ coopPosting: { OR: [{ company: contains }, { role: contains }] } }, { organization: { name: contains } }] },
      include: { coopPosting: true, organization: true },
      take: 6,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.coopPosting.findMany({
      where: { duplicateOfId: null, saved: null, OR: [{ company: contains }, { role: contains }] },
      orderBy: { firstSeenAt: "desc" },
      take: 8,
    }),
    prisma.organization.findMany({ where: { OR: [{ name: contains }, { description: contains }] }, take: 6 }),
    prisma.contact.findMany({ where: { OR: [{ name: contains }, { company: contains }] }, take: 5 }),
  ]);

  return [
    ...applications.map((a) => ({
      id: `a-${a.id}`,
      kind: "application" as const,
      title: a.coopPosting?.role ?? a.organization?.name ?? "Application",
      subtitle: `Application · ${a.coopPosting?.company ?? "Org"}`,
      href: `/applications/${a.id}`,
      logoName: a.coopPosting?.company ?? a.organization?.name,
      logoUrl: a.coopPosting?.url ?? a.organization?.url,
    })),
    ...jobs.map((j) => ({
      id: `j-${j.id}`,
      kind: "job" as const,
      title: j.role,
      subtitle: `${j.company}${j.location ? ` · ${j.location}` : ""}`,
      href: `/jobs?q=${encodeURIComponent(j.company)}`,
      logoName: j.company,
      logoUrl: j.url,
    })),
    ...orgs.map((o) => ({
      id: `o-${o.id}`,
      kind: o.kind as SearchResult["kind"],
      title: o.name,
      subtitle: o.kind === "design_team" ? "Design team" : o.kind === "club" ? "Club" : "Hackathon",
      href: ORG_HREF[o.kind as keyof typeof ORG_HREF] ?? "/",
      logoName: o.name,
      logoUrl: o.url,
    })),
    ...contacts.map((c) => ({
      id: `c-${c.id}`,
      kind: "contact" as const,
      title: c.name,
      subtitle: [c.role, c.company].filter(Boolean).join(" · ") || "Contact",
      href: `/contacts#${c.id}`,
    })),
  ];
}
