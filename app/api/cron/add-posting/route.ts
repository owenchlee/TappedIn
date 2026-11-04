import { revalidatePath } from "next/cache";
import { isAuthorizedCronRequest } from "@/lib/apiAuth";
import { findOrCreateManualPosting } from "@/lib/postings";
import { termsFromText } from "@/lib/terms";
import { rescoreJobs } from "@/lib/fit/store";

export const runtime = "nodejs";

// Local only: adds hand-found jobs (a link from a story or a friend) as manual postings through the
// running app, since the local database only takes one connection. POST { jobs: [{ company, role, url,
// location?, term? }] } with the cron bearer token. A job already in the list is reused, not duplicated.
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { jobs?: { company?: string; role?: string; url?: string; location?: string; term?: string }[] } | null;
  const jobs = (body?.jobs ?? []).filter((j) => j.company?.trim() && j.role?.trim() && j.url?.trim());
  if (jobs.length === 0) return Response.json({ error: "jobs needs company, role and url" }, { status: 400 });

  const results = [];
  for (const j of jobs) {
    const terms = j.term ? termsFromText(j.term) : undefined;
    const { id, reused } = await findOrCreateManualPosting({ company: j.company!.trim(), role: j.role!.trim(), url: j.url!.trim(), location: j.location?.trim() || null, terms });
    results.push({ id, company: j.company, role: j.role, reused });
  }
  await rescoreJobs({ onlyUnscored: true }).catch(() => null);
  revalidatePath("/", "layout");
  return Response.json({ results });
}
