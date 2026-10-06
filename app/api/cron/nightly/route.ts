import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { createNightlyJob, pickNightly } from "@/lib/autoapply/nightly";

export const runtime = "nodejs";

// Local only: scripts/nightly.ts asks which jobs to tailor tonight (GET), then creates them one at a
// time (POST) and runs the tailoring itself. Same bearer token as the daily refresh.

function denied(req: Request): Response | null {
  if (process.env.AUTO_APPLY_ENABLED !== "1") return Response.json({ error: "Resume tailoring is off (AUTO_APPLY_ENABLED)" }, { status: 404 });
  if (!isAuthorizedCronRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  const params = new URL(req.url).searchParams;
  const target = Math.min(50, Math.max(1, Number(params.get("target")) || 15));
  const minScore = Number(params.get("minScore") ?? 50) || 0;
  const maxAgeDays = Math.max(1, Number(params.get("maxAgeDays")) || 14);
  return Response.json(await pickNightly({ target, minScore, maxAgeDays }));
}

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  const body = (await req.json().catch(() => null)) as { postingId?: string; batch?: string } | null;
  if (!body?.postingId || !body.batch || !/^\d{4}-\d{2}-\d{2}$/.test(body.batch)) {
    return Response.json({ error: "postingId and batch (YYYY-MM-DD) are required" }, { status: 400 });
  }
  return Response.json({ jobId: await createNightlyJob(body.postingId, body.batch) });
}
