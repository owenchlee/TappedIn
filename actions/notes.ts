"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

function revalidateAll() {
  revalidatePath("/coop");
  revalidatePath("/design-teams");
  revalidatePath("/clubs");
  revalidatePath("/");
  revalidatePath("/saved");
}

export async function saveNotes(kind: "coop" | "org", id: string, notes: string) {
  if (kind === "coop") {
    await prisma.coopPosting.update({ where: { id }, data: { notes } });
  } else {
    await prisma.organization.update({ where: { id }, data: { notes } });
  }
  revalidateAll();
}
