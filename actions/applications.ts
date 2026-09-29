"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateInputToStorage } from "@/lib/deadline";
import { findOrCreateManualPosting } from "@/lib/postings";
import { CHANNELS, EVENT_TYPES, SAVED_STATUSES, type EventType, type SavedStatus } from "@/lib/types";
import { parseTermCode } from "@/lib/terms";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/", "layout");
}

const PIPELINE_ORDER: SavedStatus[] = ["interested", "applied", "oa", "interview", "offer", "accepted"];

/** Moves an application to a new stage and records it on the timeline. */
async function moveStage(savedId: string, status: SavedStatus, at: Date = new Date()) {
  const current = await prisma.savedItem.findUniqueOrThrow({ where: { id: savedId }, select: { status: true, appliedAt: true } });
  if (current.status === status) return;
  await prisma.$transaction([
    prisma.savedItem.update({
      where: { id: savedId },
      data: {
        status,
        statusChangedAt: at,
        ...(status === "applied" && current.appliedAt == null ? { appliedAt: at } : {}),
      },
    }),
    prisma.applicationEvent.create({
      data: { savedItemId: savedId, type: "stage", at, fromStatus: current.status, toStatus: status },
    }),
  ]);
}

export async function setStage(savedId: string, status: string): Promise<void> {
  if (!SAVED_STATUSES.includes(status as SavedStatus)) throw new Error(`Invalid status: ${status}`);
  await moveStage(savedId, status as SavedStatus);
  revalidateAll();
}

/** Start tracking a fetched/manual posting (idempotent). Returns the application id. */
export async function trackPosting(postingId: string, status: SavedStatus = "interested"): Promise<string> {
  const posting = await prisma.coopPosting.findUniqueOrThrow({
    where: { id: postingId },
    select: { id: true, terms: true, duplicateOfId: true, saved: { select: { id: true } } },
  });
  // Always track the canonical row, so a job seen through two sources is one application.
  const targetId = posting.duplicateOfId ?? posting.id;
  const existing = await prisma.savedItem.findUnique({ where: { coopPostingId: targetId }, select: { id: true } });
  if (existing) {
    if (status !== "interested") await moveStage(existing.id, status);
    revalidateAll();
    return existing.id;
  }
  const now = new Date();
  const created = await prisma.savedItem.create({
    data: {
      category: "coop",
      status,
      coopPostingId: targetId,
      term: posting.terms[0] ?? null,
      statusChangedAt: now,
      appliedAt: status === "applied" ? now : null,
      events: { create: { type: "stage", at: now, toStatus: status } },
    },
  });
  revalidateAll();
  return created.id;
}

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? dateInputToStorage(v) : null));

const detailsSchema = z.object({
  term: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((v) => !v || parseTermCode(v) != null, "Term looks like F26, W27, or S27"),
  channel: z.enum(CHANNELS).optional().or(z.literal("")),
  refId: z.string().trim().max(100).optional(),
  resume: z.string().trim().max(100).optional(),
  pay: z.string().trim().max(60).optional(),
  nextStep: z.string().trim().max(200).optional(),
  nextStepAt: optionalDate,
  deadline: optionalDate,
});

export async function updateApplication(savedId: string, formData: FormData): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const item = await prisma.savedItem.update({
    where: { id: savedId },
    data: {
      term: d.term || null,
      channel: d.channel || null,
      refId: d.refId || null,
      resume: d.resume || null,
      pay: d.pay || null,
      nextStep: d.nextStep ?? "",
      nextStepAt: d.nextStepAt,
    },
    select: { coopPostingId: true, organizationId: true },
  });
  if (formData.has("deadline")) {
    if (item.coopPostingId) await prisma.coopPosting.update({ where: { id: item.coopPostingId }, data: { deadline: d.deadline } });
    if (item.organizationId) await prisma.organization.update({ where: { id: item.organizationId }, data: { deadline: d.deadline } });
  }
  revalidateAll();
  return { ok: true };
}

export async function clearNextStep(savedId: string): Promise<void> {
  await prisma.savedItem.update({ where: { id: savedId }, data: { nextStep: "", nextStepAt: null } });
  revalidateAll();
}

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  title: z.string().trim().max(200).optional(),
  at: z.string().trim().min(1, "Pick a date"),
  notes: z.string().trim().max(5000).optional(),
});

/** Parses a <input type="datetime-local"> (or date) value as America/Toronto wall-clock time. */
function torontoLocalToDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateInputToStorage(value);
  const [datePart, timePart = "12:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // Offset of Toronto from UTC at that instant (−4h in summer, −5h in winter).
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "longOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(tzName ?? "");
  const offsetMin = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : -300;
  return new Date(guess.getTime() - offsetMin * 60_000);
}

export async function addEvent(savedId: string, formData: FormData): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { type, title, at, notes } = parsed.data;
  const when = torontoLocalToDate(at);

  await prisma.applicationEvent.create({
    data: { savedItemId: savedId, type, title: title ?? "", at: when, notes: notes ?? "" },
  });

  // Logging an OA/interview/offer implies the application reached that stage.
  const implied: Partial<Record<EventType, SavedStatus>> = { oa: "oa", interview: "interview", offer: "offer" };
  const target = implied[type];
  if (target) {
    const current = await prisma.savedItem.findUniqueOrThrow({ where: { id: savedId }, select: { status: true } });
    const from = PIPELINE_ORDER.indexOf(current.status as SavedStatus);
    if (from >= 0 && from < PIPELINE_ORDER.indexOf(target)) await moveStage(savedId, target);
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<void> {
  await prisma.applicationEvent.delete({ where: { id: eventId } });
  revalidateAll();
}

export async function untrack(savedId: string): Promise<void> {
  await prisma.savedItem.delete({ where: { id: savedId } });
  revalidateAll();
}

const quickAddSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  role: z.string().trim().min(1, "Role is required").max(300),
  url: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^https?:\/\//i.test(v), "Link must start with http:// or https://"),
  location: z.string().trim().max(200).optional(),
  deadline: optionalDate,
  term: z.string().trim().toUpperCase().optional(),
  channel: z.enum(CHANNELS).optional().or(z.literal("")),
  refId: z.string().trim().max(100).optional(),
  status: z.enum(SAVED_STATUSES).default("applied"),
});

/** One-step "I applied to X" — creates (or reuses) the posting and starts tracking it. */
export async function quickAdd(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = quickAddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const term = d.term && parseTermCode(d.term) ? d.term : undefined;

  const posting = await findOrCreateManualPosting({
    company: d.company,
    role: d.role,
    url: d.url,
    location: d.location,
    deadline: d.deadline,
    terms: term ? [term] : undefined,
  });
  const id = await trackPosting(posting.id, d.status);
  await prisma.savedItem.update({
    where: { id },
    data: {
      ...(term ? { term } : {}),
      channel: d.channel || (d.url ? "direct" : "waterlooworks"),
      refId: d.refId || null,
    },
  });
  revalidateAll();
  return { ok: true, data: { id } };
}

/**
 * Paste a batch, one per line: "Company | Role", "Company | Role | link", or "Company - Role".
 * Built for WaterlooWorks cycles where you apply to dozens of postings in one sitting.
 */
export async function bulkAdd(formData: FormData): Promise<ActionResult<{ added: number; skipped: string[] }>> {
  const text = String(formData.get("lines") ?? "");
  const term = String(formData.get("term") ?? "").trim().toUpperCase();
  const channel = String(formData.get("channel") ?? "waterlooworks");
  const status = SAVED_STATUSES.includes(formData.get("status") as SavedStatus) ? (formData.get("status") as SavedStatus) : "applied";

  const skipped: string[] = [];
  let added = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.includes("|") ? line.split("|") : line.includes("\t") ? line.split("\t") : line.split(/\s+[-–—]\s+/);
    const [company, role, url] = parts.map((p) => p.trim());
    if (!company || !role) {
      skipped.push(line);
      continue;
    }
    const fd = new FormData();
    fd.set("company", company);
    fd.set("role", role);
    if (url && /^https?:\/\//.test(url)) fd.set("url", url);
    if (term) fd.set("term", term);
    fd.set("channel", CHANNELS.includes(channel as (typeof CHANNELS)[number]) ? channel : "waterlooworks");
    fd.set("status", status);
    const result = await quickAdd(fd);
    if (result.ok) added++;
    else skipped.push(line);
  }
  revalidateAll();
  return { ok: true, data: { added, skipped } };
}

export async function linkContact(savedId: string, contactId: string): Promise<void> {
  await prisma.savedItem.update({ where: { id: savedId }, data: { contacts: { connect: { id: contactId } } } });
  revalidateAll();
}

export async function unlinkContact(savedId: string, contactId: string): Promise<void> {
  await prisma.savedItem.update({ where: { id: savedId }, data: { contacts: { disconnect: { id: contactId } } } });
  revalidateAll();
}
