/**
 * The outreach pass: `npm run outreach` (scripts/nightly.ts runs it every night after the Gmail check).
 * Claude researches each cold email that hasn't been (a specific hook plus a small proof-of-work doc)
 * and drafts the one follow-up for emails sent a week ago. Drafts land on /outreach for Owen to
 * review; nothing is ever sent. Needs the app running.
 *   npm run outreach -- --limit 3   # at most 3 of each per run (default 6)
 */
import "dotenv/config";
import { draftFollowUps, researchTargets, type FollowUpTarget, type ResearchTarget } from "../lib/outreachAuto";

const APP_URL = "http://localhost:3000";
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 6;

async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${APP_URL}${route}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${route}: ${res.status} ${(body as { error?: string }).error ?? ""}`.trim());
  return body as T;
}

async function main() {
  const { research, followUps } = await api<{ research: ResearchTarget[]; followUps: FollowUpTarget[] }>(`/api/cron/outreach?limit=${limit}`);
  console.log(`Outreach: ${research.length} to research, ${followUps.length} follow-ups due`);
  if (!research.length && !followUps.length) return;
  const log = (s: string) => console.log(s);
  const { results: researched, attempted } = await researchTargets(research, log);
  const drafted = await draftFollowUps(followUps, log);
  const res = await api<{ research: number; followUps: number; skipped: number }>("/api/cron/outreach", {
    method: "POST",
    body: JSON.stringify({ research: researched, followUps: drafted, attempted }),
  });
  console.log(`Outreach: saved ${res.research} hook${res.research === 1 ? "" : "s"} and proof docs, ${res.followUps} follow-up draft${res.followUps === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} with nothing specific found` : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Outreach failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
