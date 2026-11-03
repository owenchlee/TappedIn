import { revalidatePath } from "next/cache";
import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import type { FollowUpResult, ResearchResult } from "@/lib/outreachAuto";

export const runtime = "nodejs";

// Local only: scripts/outreach.ts asks which cold emails need research or a follow-up draft (GET),
// has Claude prepare them, and sends the drafts back (POST). Nothing here sends an email.

const select = { id: true, company: true, about: true, location: true, contactName: true, resume: true, subject: true, body: true, notes: true, sentAt: true } as const;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit")) || 6, 20);
  const research = await prisma.outreachEmail.findMany({
    where: { status: { in: ["todo", "draft"] }, researchedAt: null },
    select,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const followUps = await prisma.outreachEmail.findMany({
    where: { status: "sent", followUpAt: { lte: new Date() }, followUpBody: "" },
    select,
    orderBy: { followUpAt: "asc" },
    take: limit,
  });
  const iso = <T extends { sentAt: Date | null }>(r: T) => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null });
  return Response.json({ research: research.map(iso), followUps: followUps.map(iso) });
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { research?: ResearchResult[]; followUps?: FollowUpResult[]; attempted?: string[] } | null;
  const now = new Date();
  let research = 0;
  let followUps = 0;
  for (const r of body?.research ?? []) {
    if (typeof r?.id !== "string") continue;
    const { count } = await prisma.outreachEmail.updateMany({
      where: { id: r.id, researchedAt: null },
      data: { hook: r.hook, proofTitle: r.proofTitle, proofDoc: r.proofDoc, researchedAt: now },
    });
    research += count;
  }
  for (const r of body?.followUps ?? []) {
    if (typeof r?.id !== "string") continue;
    const { count } = await prisma.outreachEmail.updateMany({ where: { id: r.id, status: "sent", followUpBody: "" }, data: { followUpBody: r.followUpBody } });
    followUps += count;
  }
  // Companies Claude couldn't find anything specific on are marked done too, so they aren't retried every night.
  const done = new Set((body?.research ?? []).map((r) => r.id));
  const skipped = (body?.attempted ?? []).filter((id) => typeof id === "string" && !done.has(id));
  if (skipped.length) await prisma.outreachEmail.updateMany({ where: { id: { in: skipped }, researchedAt: null }, data: { researchedAt: now } });
  if (research || followUps) revalidatePath("/outreach");
  return Response.json({ research, followUps, skipped: skipped.length });
}
