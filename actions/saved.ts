"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { SavedCategory, SavedStatus } from "@/lib/types";
import { SAVED_STATUSES } from "@/lib/types";

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

export async function toggleSave(category: SavedCategory, itemId: string): Promise<boolean> {
  const field = fkFieldFor(category);
  const existing = await prisma.savedItem.findFirst({ where: { [field]: itemId } });

  if (existing) {
    await prisma.savedItem.delete({ where: { id: existing.id } });
    revalidateAll();
    return false;
  }

  await prisma.savedItem.create({
    data: {
      category,
      [field]: itemId,
    },
  });
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
