"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  EMAIL_CHECKS,
  FOLLOW_UP_DAYS,
  LINKEDIN_STATUSES,
  OUTREACH_KINDS,
  OUTREACH_STATUSES,
  RESUMES,
  type LinkedinStatus,
  type OutreachStatus,
} from "@/lib/outreach";

export type OutreachResult = { ok: true; id: string } | { ok: false; error: string };

const schema = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  about: z.string().trim().max(300).default(""),
  location: z.string().trim().max(200).default(""),
  contactName: z.string().trim().max(200).default(""),
  contactInfo: z.string().trim().max(1000).default(""),
  email: z.string().trim().max(200).default(""),
  resume: z.enum(RESUMES).default("software"),
  subject: z.string().trim().max(300).default(""),
  body: z.string().trim().max(10000).default(""),
  notes: z.string().trim().max(5000).default(""),
  tier: z.string().trim().max(100).default(""),
  batch: z.string().trim().max(50).default(""),
  emailCheck: z.enum(EMAIL_CHECKS).default("none"),
  linkedin: z.string().trim().max(200).default(""),
  linkedinStatus: z.enum(LINKEDIN_STATUSES).default("none"),
  hook: z.string().trim().max(600).default(""),
  proofTitle: z.string().trim().max(200).default(""),
  proofDoc: z.string().trim().max(8000).default(""),
  proofUrl: z.string().trim().max(500).default(""),
  followUpBody: z.string().trim().max(3000).default(""),
  kind: z.enum(OUTREACH_KINDS).default("founder"),
  roleTitle: z.string().trim().max(300).default(""),
  roleUrl: z.string().trim().max(600).default(""),
  contactTitle: z.string().trim().max(200).default(""),
});

export async function saveOutreach(id: string | null, formData: FormData): Promise<OutreachResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = id
    ? await prisma.outreachEmail.update({ where: { id }, data: parsed.data })
    : await prisma.outreachEmail.create({ data: parsed.data });
  revalidatePath("/outreach");
  return { ok: true, id: row.id };
}

export async function setOutreachStatus(id: string, status: OutreachStatus): Promise<void> {
  if (!OUTREACH_STATUSES.includes(status)) return;
  const now = new Date();
  const week = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000);
  await prisma.outreachEmail.update({
    where: { id },
    data:
      status === "sent"
        ? { status, sentAt: now, followUpAt: week }
        : status === "draft" || status === "todo"
          ? { status, sentAt: null, followUpAt: null }
          : { status, followUpAt: null },
  });
  revalidatePath("/outreach");
}

export async function setLinkedinStatus(id: string, linkedinStatus: LinkedinStatus): Promise<void> {
  if (!LINKEDIN_STATUSES.includes(linkedinStatus)) return;
  await prisma.outreachEmail.update({ where: { id }, data: { linkedinStatus } });
  revalidatePath("/outreach");
}

export async function deleteOutreach(id: string): Promise<void> {
  await prisma.outreachEmail.delete({ where: { id } });
  revalidatePath("/outreach");
}
