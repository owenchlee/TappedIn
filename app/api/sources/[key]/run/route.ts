import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { runSourceByKey } from "@/lib/jobs/dailyRefresh";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const summary = await runSourceByKey(key);
  return Response.json({ summary });
}
