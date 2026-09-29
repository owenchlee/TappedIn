"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateInputToStorage } from "@/lib/deadline";
import { COOP_STATUSES } from "@/lib/types";
import { manualFacets } from "@/lib/postings";

function revalidateCoop() {
  revalidatePath("/", "layout");
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function isHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

const httpUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .refine(isHttpUrl, "URL must start with http:// or https://");

const createSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  role: z.string().trim().min(1, "Role is required"),
  url: httpUrlSchema,
  location: z.string().trim().optional(),
  deadline: z.string().trim().optional(),
  notes: z.string().trim().max(5000, "Notes are limited to 5000 characters").optional(),
});

// Next.js redacts thrown Server Action error messages in production, so validation failures are
// returned as a result object rather than thrown — the client-visible message survives either way.
export async function createPosting(formData: FormData): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    company: formData.get("company"),
    role: formData.get("role"),
    url: formData.get("url"),
    location: formData.get("location") || undefined,
    deadline: formData.get("deadline") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  await prisma.coopPosting.create({
    data: {
      company: data.company,
      role: data.role,
      url: data.url,
      location: data.location || null,
      deadline: data.deadline ? dateInputToStorage(data.deadline) : null,
      notes: data.notes ?? "",
      origin: "manual",
      status: "open",
      ...manualFacets(data),
    },
  });

  revalidateCoop();
  return { ok: true };
}

const updateSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  role: z.string().trim().min(1, "Role is required"),
  url: httpUrlSchema,
  location: z.string().trim().optional(),
  deadline: z.string().trim().optional(),
});

export async function updatePosting(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = updateSchema.safeParse({
    company: formData.get("company"),
    role: formData.get("role"),
    url: formData.get("url"),
    location: formData.get("location") || undefined,
    deadline: formData.get("deadline") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  await prisma.coopPosting.update({
    where: { id },
    data: {
      company: data.company,
      role: data.role,
      url: data.url,
      location: data.location || null,
      deadline: data.deadline ? dateInputToStorage(data.deadline) : null,
      ...manualFacets(data),
    },
  });

  revalidateCoop();
  return { ok: true };
}

export async function deletePosting(id: string) {
  await prisma.coopPosting.delete({ where: { id } });
  revalidateCoop();
}

export async function setPostingStatus(id: string, status: string) {
  if (!COOP_STATUSES.includes(status as (typeof COOP_STATUSES)[number])) {
    throw new Error(`Invalid status: ${status}`);
  }
  await prisma.coopPosting.update({
    where: { id },
    data:
      status === "closed"
        ? // Marking closed by hand is itself a "reviewed" decision — set dismissedAt so it's
          // eligible to be hidden by the coop tab's default filter, same as a resolved
          // possibly-closed flag. Without this, a manually-closed posting has no dismissedAt and
          // can never be hidden even with "Show closed" toggled off.
          { status, dismissedAt: new Date() }
        : // Moving off "closed" clears the auto-tracking fields so a stale dismissal/miss-count
          // doesn't linger inconsistently with the new status.
          { status, dismissedAt: null, disappearedAt: null, missCount: 0 },
  });
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
