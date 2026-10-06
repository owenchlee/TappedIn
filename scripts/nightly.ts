/**
 * The nightly batch: `npm run nightly`. Windows Task Scheduler runs it at 2 AM
 * (scripts/install-nightly.ps1). It makes sure the database and app are up, refreshes the job lists,
 * picks the best jobs Owen can apply to and hasn't touched (topping the morning queue back up to
 * 15), and tailors a resume (plus a cover letter when the posting asks) for each, one at a time.
 * Nothing is ever submitted: Owen works through the queue at /apply/queue in the morning.
 *
 *   npm run nightly                      # the real run
 *   npm run nightly -- --count 5         # queue target other than 15 (or NIGHTLY_COUNT in .env)
 *   npm run nightly -- --min-score 60    # lowest fit score to pick (default 50, or NIGHTLY_MIN_SCORE)
 *   npm run nightly -- --dry-run         # only print what it would pick
 *   npm run nightly -- --no-refresh      # skip refreshing the job lists first
 */
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PRIVATE_DIR, readJob, writeJob } from "../lib/autoapply/job";
import type { NightlyPick } from "../lib/autoapply/nightly";

const APP_URL = "http://localhost:3000";
const NIGHTLY_DIR = path.join(PRIVATE_DIR, "nightly");
const LOCK = path.join(NIGHTLY_DIR, "running.lock");
// A job takes 2 to 8 minutes (scoring plus up to 1 quality rewrite); anything near this is stuck.
const JOB_TIMEOUT_MS = 30 * 60_000;
// Claude Code's plan limit: no point starting more jobs until it resets.
// e.g. "You've hit your session limit · resets 2am (America/Toronto)".
const LIMIT_RE = /session limit|usage limit|rate limit|limit reached|hit your limit|out of extra usage/i;

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const target = Number(option("count") ?? process.env.NIGHTLY_COUNT ?? 15);
const minScore = Number(option("min-score") ?? process.env.NIGHTLY_MIN_SCORE ?? 50);
const dryRun = flag("dry-run");

/** Toronto's date, so a 2 AM run belongs to the morning it's for. */
const batch = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const say = (msg: string) => console.log(`[nightly ${new Date().toISOString()}] ${msg}`);

async function api<T>(route: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const res = await fetch(`${APP_URL}${route}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${route}: ${res.status} ${(body as { error?: string }).error ?? ""}`.trim());
  return body as T;
}

function tsx(script: string, args: string[]): { cmd: string; args: string[] } {
  return { cmd: process.execPath, args: [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), path.join(process.cwd(), "scripts", script), ...args] };
}

function runTailor(jobId: string): Promise<void> {
  const { cmd, args } = tsx("autoapply.ts", [jobId]);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), JOB_TIMEOUT_MS);
    child.on("close", () => (clearTimeout(timer), resolve()));
    child.on("error", () => (clearTimeout(timer), resolve()));
  });
}

type Result = NightlyPick & { jobId?: string; status: "ready" | "failed" | "not started"; note?: string; coverLetter?: boolean; minutes?: number };

function writeReport(results: Result[], queued: number, notes: string[]) {
  mkdirSync(NIGHTLY_DIR, { recursive: true });
  const ready = results.filter((r) => r.status === "ready").length;
  writeFileSync(path.join(NIGHTLY_DIR, `${batch}.json`), JSON.stringify({ batch, finishedAt: new Date().toISOString(), target, minScore, queuedBefore: queued, ready, results, notes }, null, 2));
  say(`Done: ${ready} of ${results.length} tailored; queue had ${queued} waiting before tonight.`);
}

async function main() {
  mkdirSync(NIGHTLY_DIR, { recursive: true });
  if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < 4 * 3_600_000) {
    say("Another nightly run is still going; exiting.");
    return;
  }
  writeFileSync(LOCK, String(process.pid));
  const notes: string[] = [];
  try {
    if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET isn't set in .env");

    // Database + app (only starts what's missing).
    const app = tsx("run-app.ts", ["--no-open"]);
    const up = spawnSync(app.cmd, app.args, { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
    if (up.status !== 0) throw new Error("Couldn't start the database or the app (output above)");

    if (!flag("no-refresh") && !dryRun) {
      say("Refreshing the job lists (a few minutes)");
      try {
        await api("/api/cron/refresh", { method: "POST" }, 8 * 60_000);
      } catch (err) {
        notes.push(`Job list refresh failed, used yesterday's list: ${err instanceof Error ? err.message : err}`);
        say(notes.at(-1)!);
      }
    }

    const { queued, picks } = await api<{ queued: number; picks: NightlyPick[] }>(`/api/cron/nightly?target=${target}&minScore=${minScore}`);
    say(`${queued} still waiting in the queue; tailoring ${picks.length} more (target ${target}, min score ${minScore})`);
    for (const p of picks) say(`  ${p.fitScore ?? "?"}  ${p.company} · ${p.role}${p.deadline ? ` (closes ${p.deadline.slice(0, 10)})` : ""}`);
    if (dryRun) return;

    const results: Result[] = picks.map((p) => ({ ...p, status: "not started" }));
    for (const r of results) {
      const started = Date.now();
      try {
        r.jobId = (await api<{ jobId: string }>("/api/cron/nightly", { method: "POST", body: JSON.stringify({ postingId: r.postingId, batch }) })).jobId;
      } catch (err) {
        r.status = "failed";
        r.note = err instanceof Error ? err.message : String(err);
        continue;
      }
      say(`Tailoring ${r.company} · ${r.role}`);
      await runTailor(r.jobId);
      const job = readJob(r.jobId);
      r.minutes = Math.round((Date.now() - started) / 6000) / 10;
      r.status = job?.status === "ready" ? "ready" : "failed";
      r.coverLetter = Boolean(job?.coverLetter?.needed);
      r.note = job?.error ?? job?.warnings?.join("; ");
      if (job?.status === "running") {
        // Timed out mid-step: mark it so it doesn't sit as "Working" forever.
        job.status = "failed";
        job.error = "The nightly run stopped this job after 30 minutes";
        writeJob(job);
      }
      say(`  ${r.status}${r.note ? `: ${r.note}` : ""} (${r.minutes} min)`);
      if (r.status === "failed" && LIMIT_RE.test(r.note ?? "")) {
        // Nothing was made, and a kept failed run would stop this job from ever being picked again.
        rmSync(path.join(PRIVATE_DIR, "applications", r.jobId), { recursive: true, force: true });
        r.status = "not started";
        notes.push("Stopped early: Claude's usage limit was hit. The rest will be picked tomorrow night.");
        say(notes.at(-1)!);
        break;
      }
    }
    writeReport(results, queued, notes);
  } finally {
    rmSync(LOCK, { force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    say(`✗ ${err instanceof Error ? err.message : err}`);
    try {
      mkdirSync(NIGHTLY_DIR, { recursive: true });
      writeFileSync(path.join(NIGHTLY_DIR, `${batch}.json`), JSON.stringify({ batch, finishedAt: new Date().toISOString(), error: String(err instanceof Error ? err.message : err) }, null, 2));
    } catch {}
    rmSync(LOCK, { force: true });
    process.exit(1);
  });

