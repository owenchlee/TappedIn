import { revalidatePath } from "next/cache";
import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { INBOX_STATUSES, type InboxApp, type InboxUpdate } from "@/lib/autoapply/inbox";

export const runtime = "nodejs";

// Local only: scripts/nightly.ts asks which applications are still in play (GET), has Claude read
// Gmail for news on them, then sends back the status changes it found (POST).

const IN_PLAY = ["applied", "oa", "interview", "offer"];
// An email can move an application forward or close it out, never back a stage.
const ORDER = ["applied", "oa", "interview", "offer"];

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.savedItem.findMany({
    where: { status: { in: IN_PLAY } },
    select: { id: true, status: true, appliedAt: true, coopPosting: { select: { company: true, role: true } }, organization: { select: { name: true } } },
    orderBy: { appliedAt: "asc" },
  });
  // Recently closed ones too, so Claude knows the emails that closed them are already accounted for
  // (and doesn't pin the same rejection on a second application at that company).
  const closed = await prisma.savedItem.findMany({
    where: { status: { in: ["rejected", "withdrawn"] }, statusChangedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    select: { id: true, status: true, appliedAt: true, coopPosting: { select: { company: true, role: true } }, organization: { select: { name: true } } },
  });
  const view = (i: (typeof items)[number]): InboxApp => ({
    id: i.id,
    company: i.coopPosting?.company ?? i.organization?.name ?? "",
    role: i.coopPosting?.role ?? "",
    status: i.status,
    appliedAt: i.appliedAt?.toISOString().slice(0, 10) ?? null,
  });
  return Response.json({ apps: items.map(view), closed: closed.map(view) });
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { updates?: InboxUpdate[] } | null;
  const applied: InboxUpdate[] = [];
  for (const u of body?.updates ?? []) {
    if (typeof u?.id !== "string" || !(INBOX_STATUSES as readonly string[]).includes(u.status)) continue;
    const cur = await prisma.savedItem.findUnique({ where: { id: u.id }, select: { status: true } });
    if (!cur || !IN_PLAY.includes(cur.status) || cur.status === u.status) continue;
    if (ORDER.includes(u.status) && ORDER.indexOf(u.status) < ORDER.indexOf(cur.status)) continue;
    const parsed = new Date(u.at);
    const at = Number.isNaN(parsed.getTime()) || parsed > new Date() ? new Date() : parsed;
    const notes = `From Gmail: ${String(u.evidence ?? "").slice(0, 300)}`;
    await prisma.$transaction([
      prisma.savedItem.update({ where: { id: u.id }, data: { status: u.status, statusChangedAt: at } }),
      prisma.applicationEvent.create({ data: { savedItemId: u.id, type: "stage", at, fromStatus: cur.status, toStatus: u.status, notes } }),
    ]);
    applied.push({ ...u, at: at.toISOString() });
  }
  if (applied.length) revalidatePath("/", "layout");
  return Response.json({ applied });
}
