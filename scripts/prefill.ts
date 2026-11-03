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
 * Owen has since sorted out in the open tab. Each worker only sees the tabs of its own session, so it
 * can't reuse his old tab: it opens the form fresh (his sign-in carries over) and he closes the old one.
 *
 * Per job: find the employer's own posting when the queue only has a job-board link (csjobs.ca and
 * friends don't count), then a headless `claude -p --chrome` opens it in a new tab, runs Simplify's
 * autofill, swaps in the tailored resume and stops short of Submit. Every job runs at the same time
 * (PREFILL_CONCURRENCY to cap it). A Windows notification says when they're all done.
 */
import "dotenv/config";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude, type ClaudeRun } from "../lib/autoapply/claude";
import { PRIVATE_DIR, jobDir, readJob, writeJob } from "../lib/autoapply/job";
import { ALL_FLAG, PREFILL_ERROR, PREFILL_LOCK, takeFinishQueue, checkResume, chromeStalled, parseResult, prefillPrompt, readPrefill, saveAccount, summarizeTiming, verifyPrompt, writePrefill, type Prefill, type ReportedResume, type ResumeCheck, type Timing } from "../lib/autoapply/prefill";
import { scriptFill, scriptable } from "../lib/autoapply/scriptfill";
import { checkPosting, findRealSource, isThirdParty } from "../lib/autoapply/source";
import { notify } from "../lib/notify";

// --resume: Owen has since made the account / signed in by hand in the job's open tab; carry on from there.
const resuming = process.argv.includes("--resume");
// --verify: don't fill anything; re-read each job's open tab and compare its resume with the tailored PDF.
const verifying = process.argv.includes("--verify");
// --submit: once the gates pass, the worker clicks the final Submit itself (the "Apply for me" button).
const submitting = process.argv.includes("--submit");
// --all: "Apply to everything": a job that needs Owen never holds the line up; the next one starts, and a job he
// answers meanwhile is finished by this same run.
const allMode = process.argv.includes("--all");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// Ten Chrome sessions at once is what made the extension stall; a few at a time finish sooner overall.
const concurrency = Math.max(1, Number(process.env.PREFILL_CONCURRENCY) || Math.min(ids.length, 4) || 1);
// Browser work is screenshots and clicks, not writing: Sonnet does it fine for far fewer credits.
const model = process.env.PREFILL_MODEL || "sonnet";
const say = (msg: string) => console.log(`[prefill ${new Date().toISOString()}] ${msg}`);

function set(jobId: string, patch: Partial<Prefill>) {
  writePrefill(jobId, { ...(readPrefill(jobId) ?? { state: "queued" }), ...patch });
}

const CHROME_DOWN = "The Claude in Chrome extension isn't connected. Open Chrome, make sure the extension is on and signed in, then hit Process again.";
// The script that fills Greenhouse / Lever / Ashby forms itself; PREFILL_SCRIPT=0 sends everything to the Chrome worker.
const scriptOn = process.env.PREFILL_SCRIPT !== "0";

let chromeChecked: Promise<{ ok: boolean; detail: string }> | null = null;
/** Is the Claude in Chrome extension connected? Asked once per batch; a pass in the last 15 minutes is good enough. */
function chromeCheck(): Promise<{ ok: boolean; detail: string }> {
  chromeChecked ??= (async () => {
    const okFile = path.join(PRIVATE_DIR, "chrome-ok.txt");
    if (existsSync(okFile) && Date.now() - statSync(okFile).mtimeMs < 15 * 60_000) return { ok: true, detail: "recent check" };
    const check = await runClaude({
      cwd: PRIVATE_DIR,
      prompt: "Call the tabs_context_mcp tool once with createIfEmpty true. Then reply with exactly CONNECTED if it listed tabs, or NOT_CONNECTED if it said the extension isn't connected or failed.",
      allowedTools: ["mcp__claude-in-chrome"],
      model: "haiku",
      extraArgs: ["--chrome"],
      timeoutMs: 45_000,
    });
    const ok = /\bCONNECTED\b/.test(check.result) && !/NOT_CONNECTED/.test(check.result);
    if (ok) writeFileSync(okFile, new Date().toISOString());
    return { ok, detail: check.error ?? check.result.slice(0, 200) };
  })();
  return chromeChecked;
}
const chromeReady = async () => (await chromeCheck()).ok;

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

  // Many listings already link straight to the employer's ATS (Greenhouse, Ashby...): that IS the posting, so the
  // worker needn't search for it (it used to treat every such job as a job-board link).
  if (!resuming && !job.applyUrl && !isThirdParty(job.url)) {
    job.applyUrl = job.url;
    job.applyUrlNote = "the listing already links to the employer's own page";
    writeJob(job);
  }

  // A plain fetch of the employer's page first: a gone or wrong-term posting shouldn't cost a Chrome run.
  if (!resuming && job.applyUrl && !isThirdParty(job.applyUrl)) {
    const pre = await checkPosting(job.applyUrl, job.termConfirmed);
    if (pre.skip) {
      if (pre.closed) {
        job.closedAt = new Date().toISOString();
        writeJob(job);
      }
      set(jobId, { state: pre.closed ? "failed" : "needs_you", note: pre.closed ? `Closed: ${pre.note}` : pre.note, url: job.applyUrl, finishedAt: new Date().toISOString() });
      say(`${job.company}: skipped before Chrome (${pre.note})`);
      return;
    }
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

  const timings: Timing[] = [];
  let costUsd = 0;
  const attempt = async (formUrl: string | undefined) => {
    const run = await runClaude({
      cwd: jobDir(jobId),
      prompt: prefillPrompt(job, { resume, coverLetter: job.coverLetter?.needed && existsSync(letter) ? letter : undefined }, profile, formUrl, submitting ? { resumeSize: statSync(resume).size } : undefined),
      // WebSearch only when the worker has to hunt for the employer's posting; otherwise it just wanders.
      allowedTools: ["mcp__claude-in-chrome", ...(formUrl || job.applyUrl ? [] : ["WebSearch"]), "mcp__claude_ai_Gmail__search_threads", "mcp__claude_ai_Gmail__get_thread"],
      model,
      extraArgs: ["--chrome"],
      timeoutMs: 12 * 60_000,
    });
    timings.push(summarizeTiming(run));
    costUsd += run.costUsd;
    const r: ReturnType<typeof parseResult> = run.ok ? parseResult(run.result) : { state: "failed", note: run.error?.slice(0, 300) ?? "Claude failed" };
    return { run, r };
  };
  // Greenhouse, Lever and Ashby forms are filled by a script with one model call (PREFILL_SCRIPT=0 turns that off);
  // anything it can't read before touching the form falls through to the Chrome worker below.
  let r: ReturnType<typeof parseResult> | undefined;
  let run: ClaudeRun | undefined;
  if (!resuming && scriptOn && scriptable(job)) {
    set(jobId, { note: "Filling the form by script" });
    const sf = await scriptFill(job, {
      resume,
      coverLetter: job.coverLetter?.needed && existsSync(letter) ? letter : undefined,
      profile,
      experience: existsSync(path.join(PRIVATE_DIR, "experience.md")) ? readFileSync(path.join(PRIVATE_DIR, "experience.md"), "utf8") : "(missing)",
      model: process.env.PREFILL_FILL_MODEL || model,
      submit: submitting ? { resumeSize: statSync(resume).size } : undefined,
      cwd: jobDir(jobId),
    });
    if (sf.fallback) {
      say(`${job.company}: script passed (${sf.why}); using the Chrome worker`);
    } else {
      r = sf.r;
      timings.push(sf.timing);
      costUsd += sf.costUsd;
    }
  }
  if (!r) {
    if (!(await chromeReady())) {
      set(jobId, { state: "failed", note: CHROME_DOWN, finishedAt: new Date().toISOString() });
      return;
    }
    ({ run, r } = await attempt(resumeUrl));
  }
  // The worker lost Chrome (the extension stalled) rather than being stopped by the form: carry on once from
  // where it was, in a fresh tab. Never after a submit click, so an application can't go in twice.
  let retried = false;
  if (run && !r.closed && r.state !== "submitted" && chromeStalled(run, r.note) && !(submitting && /submit|clicked/i.test(r.note ?? ""))) {
    retried = true;
    say(`${job.company}: Chrome stalled (${r.note ?? run.error?.slice(0, 80)}); retrying once`);
    set(jobId, { note: "Chrome stalled; trying again" });
    ({ run, r } = await attempt(r.url ?? resumeUrl ?? job.applyUrl));
    if (r.note && r.state !== "submitted") r.note += " (Retried after Chrome stalled; close the older tab for this job.)";
  }
  if (r.account) saveAccount(r.account);
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
  const wrongResume = (r.state === "ready" || r.state === "submitted") && resumeCheck?.status === "mismatch";
  set(jobId, {
    state: wrongResume && r.state !== "submitted" ? "needs_you" : r.state,
    note: r.closed ? `Closed: ${r.note ?? "the employer took it down"}` : wrongResume ? (r.state === "submitted" ? `SUBMITTED, but ${resumeCheck!.detail}` : `${resumeCheck!.detail} Swap in the right one.`) : resuming && r.note ? `${r.note} (Use the newest tab; close the older one for this job.)` : r.note,
    url: r.url,
    questions: r.questions?.length && r.state !== "submitted" ? r.questions : undefined,
    submit: submitting || undefined,
    resumeCheck,
    costUsd: Math.round(costUsd * 100) / 100,
    timing: timings,
    retried: retried || undefined,
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
  // One cheap check first, so ten workers don't each pay to find Chrome isn't connected. Jobs the script fills
  // don't use the extension at all, so a batch of only those skips the check (a fallback checks when it needs to).
  const needsWorker = resuming || verifying || ids.some((id) => { const j = readJob(id); return !j || !scriptOn || !scriptable(j); });
  if (needsWorker) {
    const check = await chromeCheck();
    if (!check.ok) {
      // Nothing was tried, so these jobs stay up for the next Process click.
      // (A resume leaves them as they were: still "needs you", ready for another Finish.)
      if (!resuming && !verifying) for (const id of ids) rmSync(path.join(jobDir(id), "prefill.json"), { force: true });
      writeFileSync(PREFILL_ERROR, CHROME_DOWN);
      notify("Couldn't start filling applications", CHROME_DOWN);
      say(`✗ ${CHROME_DOWN} (${check.detail})`);
      return;
    }
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
  const handled = new Set(ids);
  let active = 0;
  if (allMode) writeFileSync(ALL_FLAG, String(process.pid));
  const next = (): string | undefined => {
    // Jobs Owen has answered since the run began go first, so they finish while he's still at the screen.
    for (const id of takeFinishQueue()) {
      handled.add(id);
      todo.unshift(id);
    }
    return todo.shift();
  };
  const worker = async (n: number) => {
    // Stagger the starts so ten sessions don't all attach to Chrome in the same instant.
    await new Promise((res) => setTimeout(res, n * 1500));
    for (;;) {
      const id = next();
      if (!id) {
        // Nothing left to start. Other workers may still be on a job that will need a hand: stay a moment so a
        // finished question isn't turned away, but stop once everything has settled.
        if (!allMode || active === 0) break;
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      active++;
      try {
        await prefillOne(id);
        const p = readPrefill(id);
        if (allMode && p?.state === "needs_you" && p.questions?.length) {
          const j = readJob(id);
          notify(`${j?.company ?? "A job"} needs an answer`, `${p.questions[0].q.slice(0, 120)}${p.questions.length > 1 ? ` (+${p.questions.length - 1} more)` : ""} Answer it on the Apply queue; the others keep going.`);
        }
      } catch (err) {
        set(id, { state: "failed", note: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() });
      } finally {
        active--;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(ids.length, 1)) }, (_, i) => worker(i)));
  if (allMode) rmSync(ALL_FLAG, { force: true });
  ids.splice(0, ids.length, ...handled);

  const results = ids.map((id) => readPrefill(id)?.state);
  const ready = results.filter((s) => s === "ready" || s === "submitted").length;
  const sent = results.filter((s) => s === "submitted").length;
  const needs = results.filter((s) => s === "needs_you").length;
  const failed = results.filter((s) => s === "failed").length;
  notify(
    submitting ? `${sent} of ${ids.length} applications submitted` : `${ready} of ${ids.length} applications ready to review`,
    [needs && `${needs} need you`, failed && `${failed} couldn't be opened`, submitting ? "Check the Applied page." : "Review each Chrome tab, then submit."].filter(Boolean).join(" · "),
  );
  say(`Done: ${ready} ready, ${needs} need Owen, ${failed} failed`);
}

main()
  .catch((err) => say(`✗ ${err instanceof Error ? err.message : err}`))
  .finally(() => {
    rmSync(PREFILL_LOCK, { force: true });
    rmSync(ALL_FLAG, { force: true });
    process.exit(0);
  });
