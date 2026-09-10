"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateInputToStorage } from "@/lib/deadline";
import { COOP_STATUSES } from "@/lib/types";

function revalidateCoop() {
  revalidatePath("/coop");
  revalidatePath("/");
  revalidatePath("/saved");
}

const createSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  role: z.string().trim().min(1, "Role is required"),
  url: z.string().trim().url("Enter a valid URL"),
  location: z.string().trim().optional(),
  deadline: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function createPosting(formData: FormData) {
  const parsed = createSchema.parse({
    company: formData.get("company"),
    role: formData.get("role"),
    url: formData.get("url"),
    location: formData.get("location") || undefined,
    deadline: formData.get("deadline") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await prisma.coopPosting.create({
    data: {
      company: parsed.company,
      role: parsed.role,
      url: parsed.url,
      location: parsed.location || null,
      deadline: parsed.deadline ? dateInputToStorage(parsed.deadline) : null,
      notes: parsed.notes ?? "",
      origin: "manual",
      status: "open",
    },
  });

  revalidateCoop();
}

const updateSchema = z.object({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  url: z.string().trim().url(),
  location: z.string().trim().optional(),
  deadline: z.string().trim().optional(),
});

export async function updatePosting(id: string, formData: FormData) {
  const parsed = updateSchema.parse({
    company: formData.get("company"),
    role: formData.get("role"),
    url: formData.get("url"),
    location: formData.get("location") || undefined,
    deadline: formData.get("deadline") || undefined,
  });

  await prisma.coopPosting.update({
    where: { id },
    data: {
      company: parsed.company,
      role: parsed.role,
      url: parsed.url,
      location: parsed.location || null,
      deadline: parsed.deadline ? dateInputToStorage(parsed.deadline) : null,
    },
  });

  revalidateCoop();
}

export async function deletePosting(id: string) {
  await prisma.coopPosting.delete({ where: { id } });
  revalidateCoop();
}

export async function setPostingStatus(id: string, status: string) {
  if (!COOP_STATUSES.includes(status as (typeof COOP_STATUSES)[number])) {
    throw new Error(`Invalid status: ${status}`);
  }
  await prisma.coopPosting.update({ where: { id }, data: { status } });
  revalidateCoop();
}

export async function resolveDisappeared(id: string, resolution: "open" | "closed") {
  if (resolution === "open") {
    await prisma.coopPosting.update({
      where: { id },
      data: { disappearedAt: null, dismissedAt: null, missCount: 0, status: "open" },
    });
  } else {
    await prisma.coopPosting.update({
      where: { id },
      data: { dismissedAt: new Date(), status: "closed" },
    });
  }
  revalidateCoop();
}
