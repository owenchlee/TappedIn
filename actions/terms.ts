"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { setSetting } from "@/lib/data/settings";
import { parseTermCode } from "@/lib/terms";
import { TERM_KINDS } from "@/lib/types";

export type TermResult = { ok: true } | { ok: false; error: string };

const termSchema = z.object({
  kind: z.enum(TERM_KINDS),
  label: z.string().trim().max(40).default(""),
  company: z.string().trim().max(200).default(""),
  role: z.string().trim().max(200).default(""),
  location: z.string().trim().max(200).default(""),
  pay: z.string().trim().max(60).default(""),
  rating: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(5, Math.max(1, Number(v))) : null)),
  notes: z.string().trim().max(5000).default(""),
});

export async function saveTerm(code: string, formData: FormData): Promise<TermResult> {
  if (!parseTermCode(code)) return { ok: false, error: "Invalid term" };
  const parsed = termSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await prisma.term.upsert({ where: { code }, create: { code, ...parsed.data }, update: parsed.data });
  revalidatePath("/journey");
  return { ok: true };
}

export async function clearTerm(code: string): Promise<void> {
  await prisma.term.deleteMany({ where: { code } });
  revalidatePath("/journey");
}

/** Turns an accepted offer into that term's work-term entry. */
export async function termFromApplication(savedId: string): Promise<TermResult> {
  const app = await prisma.savedItem.findUnique({ where: { id: savedId }, include: { coopPosting: true } });
  if (!app?.coopPosting) return { ok: false, error: "Only co-op applications can become a work term" };
  if (!app.term || !parseTermCode(app.term)) return { ok: false, error: "Set the application's term first" };
  const data = {
    kind: "work",
    company: app.coopPosting.company,
    role: app.coopPosting.role,
    location: app.coopPosting.location ?? "",
    pay: app.pay ?? "",
    savedItemId: app.id,
  };
  await prisma.term.upsert({ where: { code: app.term }, create: { code: app.term, ...data }, update: data });
  revalidatePath("/journey");
  return { ok: true };
}

export async function setJourneyStart(code: string): Promise<void> {
  if (!parseTermCode(code)) return;
  await setSetting("journeyStart", code);
  revalidatePath("/journey");
}
