"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateInputToStorage } from "@/lib/deadline";

export type ContactResult = { ok: true; id: string } | { ok: false; error: string };

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? dateInputToStorage(v) : null));

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200).default(""),
  role: z.string().trim().max(200).default(""),
  email: z.string().trim().max(200).default(""),
  linkedin: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(5000).default(""),
  lastContactedAt: optionalDate,
  followUpAt: optionalDate,
});

export async function saveContact(id: string | null, formData: FormData, linkToApplication?: string): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const contact = id
    ? await prisma.contact.update({ where: { id }, data })
    : await prisma.contact.create({
        data: { ...data, ...(linkToApplication ? { applications: { connect: { id: linkToApplication } } } : {}) },
      });
  revalidatePath("/", "layout");
  return { ok: true, id: contact.id };
}

export async function deleteContact(id: string): Promise<void> {
  await prisma.contact.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function markContacted(id: string): Promise<void> {
  await prisma.contact.update({ where: { id }, data: { lastContactedAt: new Date(), followUpAt: null } });
  revalidatePath("/", "layout");
}
