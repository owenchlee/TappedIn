"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { OrgKind, SavedCategory, SavedStatus } from "@/lib/types";
import { SAVED_CATEGORIES } from "@/lib/types";
import { setStage, trackPosting } from "@/actions/applications";

function revalidateAll() {
  revalidatePath("/", "layout");
}

function isP2002(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Bookmark toggle on job/org cards: saving starts tracking at "Saved"; unsaving stops tracking. */
export async function toggleSave(category: SavedCategory, itemId: string): Promise<boolean> {
  if (!SAVED_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  if (category === "coop") {
    const posting = await prisma.coopPosting.findUnique({ where: { id: itemId }, select: { duplicateOfId: true } });
    if (!posting) throw new Error(`No posting found for id ${itemId}`);
    const targetId = posting.duplicateOfId ?? itemId;
    const existing = await prisma.savedItem.findUnique({ where: { coopPostingId: targetId } });
    if (existing) {
      await prisma.savedItem.delete({ where: { id: existing.id } }).catch(() => {});
      revalidateAll();
      return false;
    }
    await trackPosting(targetId);
    return true;
  }

  const existing = await prisma.savedItem.findUnique({ where: { organizationId: itemId } });
  if (existing) {
    await prisma.savedItem.delete({ where: { id: existing.id } }).catch(() => {
      // Already deleted by a concurrent toggle — treat as success either way.
    });
    revalidateAll();
    return false;
  }

  const org = await prisma.organization.findUnique({ where: { id: itemId }, select: { kind: true } });
  if (!org || org.kind !== (category as OrgKind)) throw new Error(`No ${category} item found for id ${itemId}`);

  try {
    const now = new Date();
    await prisma.savedItem.create({
      data: { category, organizationId: itemId, statusChangedAt: now, events: { create: { type: "stage", at: now, toStatus: "interested" } } },
    });
  } catch (err) {
    // Two concurrent toggles both saw "not saved" — the unique FK means only one create wins, and the
    // end state (saved) is what both callers wanted.
    if (!isP2002(err)) throw err;
  }

  revalidateAll();
  return true;
}

export async function updateSavedStatus(savedId: string, status: SavedStatus) {
  await setStage(savedId, status);
}

export async function setPinned(savedId: string, pinned: boolean) {
  await prisma.savedItem.update({ where: { id: savedId }, data: { pinned } });
  revalidateAll();
}
