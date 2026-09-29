import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { runDailyRefresh, isRefreshRunning } from "@/lib/jobs/dailyRefresh";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`; POST kept for manual/curl triggers.
async function handle(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isRefreshRunning()) {
    return Response.json({ error: "A refresh is already running" }, { status: 409 });
  }
  try {
    return Response.json(await runDailyRefresh());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
