/**
 * Prefill: opens each job's application in Owen's Chrome and gets it filled, all at once, so he only
 * reviews and submits. Started by the "Process top 10" button on /apply/queue; can also be run by hand:
 *
 *   npx tsx scripts/prefill.ts [--resume | --verify] <jobId> [<jobId> ...]
 *
 * Every run compares the resume the form ended up holding with the job's tailored PDF by file size
 * (resumeCheck in prefill.json); --verify repeats that check read-only on tabs that are already open.
 *
 * --resume is the "Finish" button: for jobs that stopped at needs_you (a Workday account, say) and that
 * Owen has since sorted out in the open tab. The worker finds that tab and carries on from there.
 *
 * Per job: find the employer's own posting when the queue only has a job-board link (csjobs.ca and
 * friends don't count), then a headless `claude -p --chrome` opens it in a new tab, runs Simplify's
 * autofill, swaps in the tailored resume and stops short of Submit. Every job runs at the same time
 * (PREFILL_CONCURRENCY to cap it). A Windows notification says when they're all done.
 */
import "dotenv/config";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude } from "../lib/autoapply/claude";
import { PRIVATE_DIR, jobDir, readJob, writeJob } from "../lib/autoapply/job";
import { PREFILL_ERROR, PREFILL_LOCK, checkResume, parseResult, prefillPrompt, readPrefill, verifyPrompt, writePrefill, type Prefill, type ReportedResume, type ResumeCheck } from "../lib/autoapply/prefill";
import { findRealSource, isThirdParty } from "../lib/autoapply/source";
import { notify } from "../lib/notify";

// --resume: Owen has since made the account / signed in by hand in the job's open tab; carry on from there.
const resuming = process.argv.includes("--resume");
// --verify: don't fill anything; re-read each job's open tab and compare its resume with the tailored PDF.
const verifying = process.argv.includes("--verify");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const concurrency = Math.max(1, Number(process.env.PREFILL_CONCURRENCY) || ids.length || 1);
// Browser work is screenshots and clicks, not writing: Sonnet does it fine for far fewer credits.
const model = process.env.PREFILL_MODEL || "sonnet";
const say = (msg: string) => console.log(`[prefill ${new Date().toISOString()}] ${msg}`);

function set(jobId: string, patch: Partial<Prefill>) {
  writePrefill(jobId, { ...(readPrefill(jobId) ?? { state: "queued" }), ...patch });
}

async function prefillOne(jobId: string) {
  const job = readJob(jobId);
  if (!job) return;
  const resumeUrl = resuming ? (readPrefill(jobId)?.url ?? job.applyUrl) : undefined;
  set(jobId, { state: "running", startedAt: new Date().toISOString(), note: resuming ? "Finishing the form" : "Finding the employer's posting" });

  if (!resuming && !job.applyUrl && isThirdParty(job.url)) {
    const src = await findRealSource(job);
    if (src.url) job.applyUrl = src.url;
    job.applyUrlNote = src.how;
    writeJob(job);
  }

  const upload = path.join(jobDir(jobId), "upload");
  const resume = path.join(upload, "Owen_Lee_Resume.pdf");
  const letter = path.join(upload, "Owen_Lee_Cover_Letter.pdf");
  if (!existsSync(resume)) {
    set(jobId, { state: "failed", note: "No tailored resume PDF for this job", finishedAt: new Date().toISOString() });
    return;
  }
  const profile = readFileSync(path.join(PRIVATE_DIR, "profile.json"), "utf8");
  set(jobId, { note: "Opening it in Chrome" });

  const run = await runClaude({
    cwd: jobDir(jobId),
    prompt: prefillPrompt(job, { resume, coverLetter: job.coverLetter?.needed && existsSync(letter) ? letter : undefined }, profile, resumeUrl),
    allowedTools: ["mcp__claude-in-chrome", "WebSearch"],
    model,
    extraArgs: ["--chrome"],
    timeoutMs: 20 * 60_000,
  });
  const r: ReturnType<typeof parseResult> = run.ok ? parseResult(run.result) : { state: "failed", note: run.error?.slice(0, 300) ?? "Claude failed" };
  // The worker found the employer's form (remember it), or saw on the employer's own site that it's closed.
  const fresh = readJob(jobId);
  if (fresh && r.closed) {
    fresh.closedAt = new Date().toISOString();
    writeJob(fresh);
  } else if (fresh && r.url && !isThirdParty(r.url) && !fresh.applyUrl) {
    fresh.applyUrl = r.url;
    fresh.applyUrlNote = "found by the Chrome worker";
    writeJob(fresh);
  }
  // Don't take the worker's word that "ready" means the right resume: compare what the form holds with the PDF.
  const resumeCheck = r.state === "failed" || r.closed ? undefined : { ...checkResume(r.resume, statSync(resume).size), checkedAt: new Date().toISOString() };
  const wrongResume = r.state === "ready" && resumeCheck?.status === "mismatch";
  set(jobId, {
    state: wrongResume ? "needs_you" : r.state,
    note: r.closed ? `Closed: ${r.note ?? "the employer took it down"}` : wrongResume ? `${resumeCheck!.detail} Swap in the right one.` : r.note,
    url: r.url,
    resumeCheck,
    costUsd: Math.round(run.costUsd * 100) / 100,
    finishedAt: new Date().toISOString(),
  });
  say(`${job.company}: ${r.state}${r.note ? ` (${r.note})` : ""}${resumeCheck ? ` [resume ${resumeCheck.status}]` : ""}`);
}

/** --verify: look at the open tab again (read-only) and compare the attached resume with the job's PDF. */
async function verifyOne(jobId: string) {
  const job = readJob(jobId);
  const resume = path.join(jobDir(jobId), "upload", "Owen_Lee_Resume.pdf");
  if (!job || !existsSync(resume)) return;
  const prev = readPrefill(jobId);
  const run = await runClaude({
    cwd: jobDir(jobId),
    prompt: verifyPrompt(job, prev?.url ?? job.applyUrl),
    allowedTools: ["mcp__claude-in-chrome"],
    model: "haiku",
    extraArgs: ["--chrome"],
    timeoutMs: 5 * 60_000,
  });
  const line = run.result.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  let seen: { found?: boolean; resume?: ReportedResume } = {};
  try {
    seen = JSON.parse(line ?? "");
  } catch {
    // leave empty: reported as unable to check
  }
  const resumeCheck: ResumeCheck = !run.ok || seen.found === undefined
    ? { status: "unverified", detail: "The re-check couldn't read the tab. Open the resume to compare." }
    : seen.found === false
      ? { status: "unverified", detail: "The re-check couldn't find this job's tab (closed?)." }
      : checkResume(seen.resume, statSync(resume).size);
  // A wrong resume found later also pulls a "ready" job back to needs_you.
  const wrong = resumeCheck.status === "mismatch" && prev?.state === "ready";
  set(jobId, { resumeCheck: { ...resumeCheck, checkedAt: new Date().toISOString() }, ...(wrong && { state: "needs_you" as const, note: `${resumeCheck.detail} Swap in the right one.` }) });
  say(`${job.company}: resume ${resumeCheck.status}`);
}

async function main() {
  if (!ids.length) throw new Error("Usage: tsx scripts/prefill.ts <jobId> [<jobId> ...]");
  writeFileSync(PREFILL_LOCK, String(process.pid));
  rmSync(PREFILL_ERROR, { force: true });
  // One cheap check first, so ten workers don't each pay to find Chrome isn't connected.
  const check = await runClaude({
    cwd: PRIVATE_DIR,
    prompt: "Call the tabs_context_mcp tool once with createIfEmpty true. Then reply with exactly CONNECTED if it listed tabs, or NOT_CONNECTED if it said the extension isn't connected or failed.",
    allowedTools: ["mcp__claude-in-chrome"],
    model: "haiku",
    extraArgs: ["--chrome"],
    timeoutMs: 2 * 60_000,
  });
  if (!/\bCONNECTED\b/.test(check.result) || /NOT_CONNECTED/.test(check.result)) {
    // Nothing was tried, so these jobs stay up for the next Process click.
    // (A resume leaves them as they were: still "needs you", ready for another Finish.)
    if (!resuming && !verifying) for (const id of ids) rmSync(path.join(jobDir(id), "prefill.json"), { force: true });
    const msg = "The Claude in Chrome extension isn't connected. Open Chrome, make sure the extension is on and signed in, then hit Process again.";
    writeFileSync(PREFILL_ERROR, msg);
    notify("Couldn't start filling applications", msg);
    say(`✗ ${msg} (${check.error ?? check.result.slice(0, 200)})`);
    return;
  }
  if (verifying) {
    const todo = [...ids];
    const worker = async () => {
      for (let id = todo.shift(); id; id = todo.shift()) await verifyOne(id).catch((err) => say(`✗ ${id}: ${err instanceof Error ? err.message : err}`));
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length, 3) }, worker));
    const checks = ids.map((id) => readPrefill(id)?.resumeCheck?.status);
    const count = (s: string) => checks.filter((c) => c === s).length;
    notify(`Resume re-check: ${count("verified")} verified`, [count("mismatch") && `${count("mismatch")} WRONG`, count("unverified") && `${count("unverified")} can't tell`].filter(Boolean).join(" · ") || "All match.");
    say(`Verified ${count("verified")}, mismatch ${count("mismatch")}, unverified ${count("unverified")}`);
    return;
  }
  say(`Prefilling ${ids.length} jobs, ${concurrency} at a time`);
  const todo = [...ids];
  const worker = async (n: number) => {
    // Stagger the starts so ten sessions don't all attach to Chrome in the same instant.
    await new Promise((res) => setTimeout(res, n * 4000));
    for (let id = todo.shift(); id; id = todo.shift()) {
      try {
        await prefillOne(id);
      } catch (err) {
        set(id, { state: "failed", note: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, (_, i) => worker(i)));

  const results = ids.map((id) => readPrefill(id)?.state);
  const ready = results.filter((s) => s === "ready").length;
  const needs = results.filter((s) => s === "needs_you").length;
  const failed = results.filter((s) => s === "failed").length;
  notify(
    `${ready} of ${ids.length} applications ready to review`,
    [needs && `${needs} need you`, failed && `${failed} couldn't be opened`, "Review each Chrome tab, then submit."].filter(Boolean).join(" · "),
  );
  say(`Done: ${ready} ready, ${needs} need Owen, ${failed} failed`);
}

main()
  .catch((err) => say(`✗ ${err instanceof Error ? err.message : err}`))
  .finally(() => {
    rmSync(PREFILL_LOCK, { force: true });
    process.exit(0);
  });
