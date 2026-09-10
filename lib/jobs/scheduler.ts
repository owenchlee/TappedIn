import cron from "node-cron";
import { prisma } from "@/lib/db";
import { runDailyRefresh, JOB_KEY } from "@/lib/jobs/dailyRefresh";

const CATCH_UP_DELAY_MS = 20_000;
const CATCH_UP_STALE_MS = 20 * 60 * 60 * 1000; // 20 hours

const globalForScheduler = globalThis as unknown as { coophubCronStarted?: boolean };

async function catchUpIfStale(): Promise<void> {
  const state = await prisma.jobState.findUnique({ where: { key: JOB_KEY } });
  const isStale = !state?.lastOkAt || Date.now() - state.lastOkAt.getTime() > CATCH_UP_STALE_MS;
  if (!isStale) return;

  console.log("[cron] last successful run is stale or missing — running the daily refresh now");
  await runDailyRefresh();
}

/**
 * Starts an in-process cron schedule for the daily fetcher, plus a boot-time catch-up check.
 *
 * Runs in-process (not a separate Railway service) because the SQLite volume can only attach to
 * one service — a standalone cron worker would have no access to the database file. The catch-up
 * check exists because a redeploy landing near the scheduled time would otherwise silently skip a
 * day: a container restart loses node-cron's in-memory schedule state entirely.
 */
export function startScheduler(): void {
  if (process.env.ENABLE_CRON !== "1") return;
  if (globalForScheduler.coophubCronStarted) return;
  globalForScheduler.coophubCronStarted = true;

  const schedule = process.env.CRON_SCHEDULE ?? "0 8 * * *";
  const timezone = process.env.TZ ?? "America/Toronto";

  cron.schedule(
    schedule,
    () => {
      runDailyRefresh().catch((err) => console.error("[cron] scheduled daily refresh failed:", err));
    },
    { timezone },
  );

  setTimeout(() => {
    catchUpIfStale().catch((err) => console.error("[cron] catch-up check failed:", err));
  }, CATCH_UP_DELAY_MS);
}
