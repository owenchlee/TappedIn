"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isRefreshRunning, runDailyRefresh, runSourceByKey, type SourceRunSummary } from "@/lib/jobs/dailyRefresh";

export async function runSourceNow(key: string): Promise<SourceRunSummary> {
  const summary = await runSourceByKey(key);
  revalidatePath("/", "layout");
  return summary;
}

export async function setSourceEnabled(key: string, enabled: boolean) {
  await prisma.companySource.update({ where: { key }, data: { enabled } });
  revalidatePath("/", "layout");
}

export async function refreshEverything(): Promise<{ created: number; failed: number; error?: string }> {
  if (isRefreshRunning()) return { created: 0, failed: 0, error: "A refresh is already running." };
  const result = await runDailyRefresh();
  revalidatePath("/", "layout");
  return {
    created: result.sources.reduce((n, s) => n + s.created, 0),
    failed: result.sources.filter((s) => !s.ok).length + (result.hackathons && !result.hackathons.ok ? 1 : 0),
  };
}
