import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { runDailyRefresh, isRefreshRunning } from "@/lib/jobs/dailyRefresh";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRefreshRunning()) {
    return Response.json({ error: "A refresh is already running" }, { status: 409 });
  }

  try {
    const summaries = await runDailyRefresh();
    return Response.json({ summaries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
