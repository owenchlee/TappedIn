"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const MAX_NOTES_LENGTH = 5000;

function revalidateAll() {
  revalidatePath("/coop");
  revalidatePath("/design-teams");
  revalidatePath("/clubs");
  revalidatePath("/");
  revalidatePath("/saved");
}

export async function saveNotes(kind: "coop" | "org", id: string, notes: string) {
  if (kind !== "coop" && kind !== "org") {
    throw new Error(`Invalid kind: ${kind}`);
  }
  const trimmed = notes.slice(0, MAX_NOTES_LENGTH);

  if (kind === "coop") {
    await prisma.coopPosting.update({ where: { id }, data: { notes: trimmed } });
  } else {
    await prisma.organization.update({ where: { id }, data: { notes: trimmed } });
  }
  revalidateAll();
}
