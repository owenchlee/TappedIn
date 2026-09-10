"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dateInputToStorage } from "@/lib/deadline";
import { ORG_STATUSES } from "@/lib/types";
import type { OrgStatus } from "@/lib/types";

function revalidateOrgs() {
  revalidatePath("/design-teams");
  revalidatePath("/clubs");
  revalidatePath("/");
  revalidatePath("/saved");
}

export async function markChecked(id: string) {
  await prisma.organization.update({ where: { id }, data: { lastCheckedAt: new Date() } });
  revalidateOrgs();
}

export async function setOrgStatus(id: string, status: string) {
  if (!ORG_STATUSES.includes(status as OrgStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  // Changing status implies the user just looked at the source.
  await prisma.organization.update({ where: { id }, data: { applicationStatus: status, lastCheckedAt: new Date() } });
  revalidateOrgs();
}

export async function setOrgDeadline(id: string, dateInput: string | null) {
  await prisma.organization.update({
    where: { id },
    data: { deadline: dateInput ? dateInputToStorage(dateInput) : null, lastCheckedAt: new Date() },
  });
  revalidateOrgs();
}
