import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { runDailyRefresh } from "@/lib/jobs/dailyRefresh";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summaries = await runDailyRefresh();
  return Response.json({ summaries });
}
