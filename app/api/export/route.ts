import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Backup of everything you've entered (behind the login, via proxy.ts). ?format=csv gives a
 * spreadsheet of applications; the default JSON has applications, timelines, contacts, terms,
 * manual postings and your edits to orgs — enough to rebuild the tracker anywhere.
 */
export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format");
  const stamp = new Date().toISOString().slice(0, 10);

  const applications = await prisma.savedItem.findMany({
    include: {
      coopPosting: true,
      organization: { select: { slug: true, name: true, kind: true, url: true } },
      events: { orderBy: { at: "asc" } },
      contacts: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (format === "csv") {
    const header = ["company_or_org", "role", "category", "stage", "term", "channel", "ref_id", "resume", "pay", "applied_at", "deadline", "next_step", "url", "notes"];
    const rows = applications.map((a) =>
      [
        a.coopPosting?.company ?? a.organization?.name,
        a.coopPosting?.role ?? "",
        a.category,
        a.status,
        a.term,
        a.channel,
        a.refId,
        a.resume,
        a.pay,
        a.appliedAt,
        a.coopPosting?.deadline,
        a.nextStep,
        a.coopPosting?.url ?? a.organization?.url,
        a.coopPosting?.notes,
      ]
        .map(csvCell)
        .join(","),
    );
    return new Response([header.join(","), ...rows].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tappedin-applications-${stamp}.csv"`,
      },
    });
  }

  const [contacts, terms, manualPostings, orgEdits, settings] = await Promise.all([
    prisma.contact.findMany(),
    prisma.term.findMany(),
    prisma.coopPosting.findMany({ where: { origin: "manual" } }),
    prisma.organization.findMany({
      where: { OR: [{ notes: { not: "" } }, { deadline: { not: null } }, { applicationStatus: { not: "unknown" } }] },
      select: { slug: true, kind: true, applicationStatus: true, deadline: true, notes: true, lastCheckedAt: true },
    }),
    prisma.setting.findMany(),
  ]);

  const body = JSON.stringify({ exportedAt: new Date(), version: 1, applications, contacts, terms, manualPostings, orgEdits, settings }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tappedin-backup-${stamp}.json"`,
    },
  });
}
