"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { runSourceByKey, type SourceRunSummary } from "@/lib/jobs/dailyRefresh";

export async function runSourceNow(key: string): Promise<SourceRunSummary> {
  const summary = await runSourceByKey(key);
  revalidatePath("/sources");
  revalidatePath("/coop");
  revalidatePath("/");
  return summary;
}

export async function setSourceEnabled(key: string, enabled: boolean) {
  await prisma.companySource.update({ where: { key }, data: { enabled } });
  revalidatePath("/sources");
}
