"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { SavedCategory, SavedStatus } from "@/lib/types";
import { SAVED_CATEGORIES, SAVED_STATUSES } from "@/lib/types";
import type { OrgKind } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/coop");
  revalidatePath("/design-teams");
  revalidatePath("/clubs");
  revalidatePath("/");
  revalidatePath("/saved");
}

function fkFieldFor(category: SavedCategory): "coopPostingId" | "organizationId" {
  return category === "coop" ? "coopPostingId" : "organizationId";
}

function isP2002(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Confirms `itemId` actually exists and matches `category`, so a stale or forged id can't create
 * a SavedItem row whose two-FK-plus-category invariant no longer lines up. */
async function entityMatchesCategory(category: SavedCategory, itemId: string): Promise<boolean> {
  if (category === "coop") {
    const posting = await prisma.coopPosting.findUnique({ where: { id: itemId }, select: { id: true } });
    return posting != null;
  }
  const org = await prisma.organization.findUnique({ where: { id: itemId }, select: { kind: true } });
  return org != null && org.kind === (category as OrgKind);
}

export async function toggleSave(category: SavedCategory, itemId: string): Promise<boolean> {
  if (!SAVED_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  const field = fkFieldFor(category);
  const existing = await prisma.savedItem.findFirst({ where: { [field]: itemId } });

  if (existing) {
    await prisma.savedItem.delete({ where: { id: existing.id } }).catch(() => {
      // Already deleted by a concurrent toggle — treat as success either way.
    });
    revalidateAll();
    return false;
  }

  if (!(await entityMatchesCategory(category, itemId))) {
    throw new Error(`No ${category} item found for id ${itemId}`);
  }

  try {
    await prisma.savedItem.create({ data: { category, [field]: itemId } });
  } catch (err) {
    // Two concurrent toggles both saw "not saved" and both tried to create — the unique index on
    // the FK means only one create wins; treat the loser as a success too, since the end state
    // (saved) is what both callers wanted.
    if (!isP2002(err)) throw err;
  }

  revalidateAll();
  return true;
}

export async function updateSavedStatus(savedId: string, status: SavedStatus) {
  if (!SAVED_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const current = await prisma.savedItem.findUnique({ where: { id: savedId } });
  const data: { status: SavedStatus; appliedAt?: Date } = { status };
  if (status === "applied" && current?.appliedAt == null) {
    data.appliedAt = new Date();
  }
  await prisma.savedItem.update({ where: { id: savedId }, data });
  revalidateAll();
}

export async function setPinned(savedId: string, pinned: boolean) {
  await prisma.savedItem.update({ where: { id: savedId }, data: { pinned } });
  revalidateAll();
}
