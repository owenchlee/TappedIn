/**
 * The Gmail check: `npm run inbox` (scripts/nightly.ts runs it every night before tailoring).
 * Claude reads Gmail for rejections, withdrawals, OA and interview invites and offers on the
 * applications still in play, and the app updates their status. Needs the app running.
 * The result goes to private/nightly/inbox.json.
 */
import "dotenv/config";
import { checkInbox, readInboxState, writeInboxState, type InboxApp, type InboxUpdate } from "../lib/autoapply/inbox";

const APP_URL = "http://localhost:3000";

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
  const started = new Date();
  const prev = readInboxState();
  try {
    const { apps, closed } = await api<{ apps: InboxApp[]; closed: InboxApp[] }>("/api/cron/inbox");
    const { updates, since, error } = await checkInbox(apps, closed);
    if (error) throw new Error(error);
    const { applied } = await api<{ applied: InboxUpdate[] }>("/api/cron/inbox", { method: "POST", body: JSON.stringify({ updates }) });
    const named = applied.map((u) => {
      const a = apps.find((x) => x.id === u.id);
      return { ...u, company: a?.company ?? "", role: a?.role ?? "" };
    });
    writeInboxState({ checkedAt: started.toISOString(), ranAt: started.toISOString(), since, inPlay: apps.length, applied: named });
    console.log(`${apps.length} in play, mail since ${since}: ${named.length || "no"} change${named.length === 1 ? "" : "s"}`);
    for (const u of named) console.log(`  ${u.status}: ${u.company} · ${u.role} (${u.evidence})`);
  } catch (err) {
    // Keep the last good checkedAt so the next run searches the missed days too.
    const error = err instanceof Error ? err.message : String(err);
    writeInboxState({ checkedAt: prev.checkedAt, ranAt: started.toISOString(), error });
    console.error(`✗ ${error}`);
    process.exitCode = 1;
  }
}

void main();
