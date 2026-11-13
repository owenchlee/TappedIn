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
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runClaude, type ClaudeRun } from "../lib/autoapply/claude";
import { PRIVATE_DIR, jobDir, listJobs, readJob, writeJob } from "../lib/autoapply/job";
import { ALL_FLAG, PREFILL_ERROR, PREFILL_LOCK, takeFinishQueue, checkResume, chromeStalled, parseResult, prefillPrompt, readPrefill, saveAccount, summarizeTiming, verifyPrompt, writePrefill, type Prefill, type ReportedResume, type ResumeCheck, type Timing } from "../lib/autoapply/prefill";
import { scriptFill, scriptable } from "../lib/autoapply/scriptfill";
import { alreadyApplied } from "../lib/autoapply/applied";
import { checkPosting, findRealSource, isThirdParty, untrustedSite } from "../lib/autoapply/source";
import { offTermTitle } from "../lib/autoapply/formfill";
import { notify } from "../lib/notify";

// --resume: Owen has since made the account / signed in by hand in the job's open tab; carry on from there.
const resuming = process.argv.includes("--resume");
// --verify: don't fill anything; re-read each job's open tab and compare its resume with the tailored PDF.
const verifying = process.argv.includes("--verify");
// --submit: once the gates pass, the worker clicks the final Submit itself (the "Apply for me" button).
// PREFILL_SUBMIT_DRYRUN=1 runs the whole submit path (Gmail duplicate check, every gate) but never clicks Submit.
const submitDryRun = process.env.PREFILL_SUBMIT_DRYRUN === "1";
const submitting = process.argv.includes("--submit") || submitDryRun;
// Turned off for the run when the Gmail duplicate check can't run.
let allowSubmit = submitting;
// --all: "Apply to everything": a job that needs Owen never holds the line up; the next one starts, and a job he
// answers meanwhile is finished by this same run.
const allMode = process.argv.includes("--all");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// Ten Chrome sessions at once is what made the extension stall; a few at a time finish sooner overall.
// Two at a time: four at once ran the PC out of memory and took the local database down (2026-11-04).
const concurrency = Math.max(1, Number(process.env.PREFILL_CONCURRENCY) || Math.min(ids.length, 2) || 1);
// Browser work is screenshots and clicks, not writing: Sonnet does it fine for far fewer credits.
const model = process.env.PREFILL_MODEL || "sonnet";
const say = (msg: string) => console.log(`[prefill ${new Date().toISOString()}] ${msg}`);

/**
 * One line per finished job: in the log as "[stats] ..." (Claude watches it live) and in private/runs.jsonl
 * (the history the run statistics come from). Details per job are in its run-report.json.
 */
function logStats(id: string) {
  try {
    const p = readPrefill(id);
    const j = readJob(id);
    let rep: Record<string, unknown> = {};
    try {
      rep = JSON.parse(readFileSync(path.join(jobDir(id), "run-report.json"), "utf8"));
      if (Date.now() - Date.parse(String(rep.at)) > 15 * 60_000) rep = {}; // an old run's report
    } catch {
      // no report (the Chrome worker ran, or the script stopped before the end)
    }
    const t = p?.timing?.at(-1);
    const row = {
      at: new Date().toISOString(),
      id,
      company: j?.company,
      role: j?.role,
      state: p?.state,
      mode: rep.mode ?? (submitting ? "submit" : "fill"),
      secs: t?.secs,
      phases: t?.phases,
      costUsd: p?.costUsd,
      resume: p?.resumeCheck?.status,
      fieldsFilled: rep.answered ? Object.keys(rep.answered as object).length : undefined,
      stillEmpty: (rep.stillEmpty as string[] | undefined)?.length,
      questions: p?.questions?.length ?? 0,
      reviewCheck: rep.reviewCheck,
      confirmation: rep.confirmation ?? null,
      note: p?.note,
    };
    appendFileSync(path.join(PRIVATE_DIR, "runs.jsonl"), JSON.stringify(row) + "\n");
    console.log(`[stats] ${JSON.stringify(row)}`);
  } catch {
    // stats never break a run
  }
}

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
  // Skipped (or closed / already submitted) while the run was going: never start it (SOTI 12-month co-ops,
  // 2026-11-04, were skipped mid-run and one ran anyway).
  if (job.skippedAt || job.closedAt || job.submittedAt) {
    set(jobId, { state: "needs_you", note: "Left alone: it was skipped or closed after this run started.", finishedAt: new Date().toISOString() });
    return;
  }
  // The same posting listed twice ("AI Software Intern" and "AI Software Intern (Canada)" were one Greenhouse job,
  // 2026-11-04): if any job with this link was already submitted, this one is a duplicate. Never apply twice.
  const link = (u?: string | null) => (u ?? "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const mine = link(job.applyUrl ?? job.url);
  const twin = mine ? listJobs().find((o) => o.id !== job.id && link(o.applyUrl ?? o.url) === mine && (o.submittedAt || readPrefill(o.id)?.state === "submitted")) : undefined;
  if (twin) {
    job.skippedAt = new Date().toISOString();
    writeJob(job);
    set(jobId, { state: "needs_you", note: `Duplicate: same posting as "${twin.role}", which you already applied to. Not applied again.`, finishedAt: new Date().toISOString() });
    say(`${job.company}: duplicate of an applied job (${twin.role}); skipped`);
    return;
  }
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

  // A company careers page wrapping Greenhouse (epicgames.com/careers/jobs/N?gh_jid=N): use Greenhouse's own posting,
  // which the script can fill. The board name is guessed from the domain and confirmed with Greenhouse's public API.
  const ghId = !resuming && job.applyUrl ? new URL(job.applyUrl).searchParams.get("gh_jid") : null;
  if (ghId && job.applyUrl && !/greenhouse\.io/i.test(new URL(job.applyUrl).hostname)) {
    const board = new URL(job.applyUrl).hostname.replace(/^(www|careers|jobs)\./, "").split(".")[0];
    const ok = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${ghId}`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.ok, () => false);
    if (ok) {
      job.applyUrl = `https://job-boards.greenhouse.io/${board}/jobs/${ghId}`;
      job.applyUrlNote = "the company page wraps a Greenhouse posting; using Greenhouse's own";
      writeJob(job);
    }
  }

  // Phishing / fake-listing guard: never open an unknown site with Owen's details. Approve a real one by adding its domain to private/trusted-hosts.txt.
  if (!resuming && job.applyUrl) {
    let trusted: string[] = [];
    try {
      trusted = readFileSync(path.join(PRIVATE_DIR, "trusted-hosts.txt"), "utf8").split(/\s+/);
    } catch {}
    let why = untrustedSite(job.applyUrl, job.company, trusted);
    if (why) {
      // Shorteners (go.vansh.nyc on the vanshb03 list): judge where the link really lands, via a plain fetch, no browser.
      const landed = await fetch(job.applyUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000) }).then((r) => r.url, () => null);
      if (landed && landed !== job.applyUrl && !untrustedSite(landed, job.company, trusted)) {
        job.applyUrl = landed;
        writeJob(job);
        why = null;
      }
    }
    if (why) {
      set(jobId, { state: "needs_you", note: `Held for safety: ${why}. If it's real, add the domain to private/trusted-hosts.txt and run it again.`, url: job.applyUrl, finishedAt: new Date().toISOString() });
      say(`${job.company}: held, untrusted site (${why})`);
      return;
    }
  }

  // The term often lives only in the title or link (McKesson "...Winter-Intern_JR0154903", 2026-11-06).
  const offTerm = job.termConfirmed ? null : offTermTitle(`${job.role} ${job.url ?? ""} ${job.applyUrl ?? ""}`);
  if (offTerm) {
    job.skippedAt = new Date().toISOString();
    writeJob(job);
    set(jobId, { state: "needs_you", note: `Skipped: the title says "${offTerm}", not Summer 2027.`, finishedAt: new Date().toISOString() });
    say(`${job.company}: skipped (${offTerm})`);
    return;
  }

  // A plain fetch of the employer's page first: a gone or wrong-term posting shouldn't cost a Chrome run.
  if (!resuming && job.applyUrl && !isThirdParty(job.applyUrl)) {
    const pre = await checkPosting(job.applyUrl, job.termConfirmed);
    if (pre.skip) {
      if (pre.closed) {
        job.closedAt = new Date().toISOString();
        writeJob(job);
      } else if (/not summer 2027/i.test(pre.note ?? "")) {
        // Owen applies for Summer 2027 only: a posting for another term leaves the queue instead of sitting on top.
        job.skippedAt = new Date().toISOString();
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
      submit: allowSubmit ? { resumeSize: statSync(resume).size } : undefined,
      cwd: jobDir(jobId),
      // A code only Owen can type: say so on the queue and with a notification, then the script waits in the tab.
      waitForYou: (why) => {
        set(jobId, { note: why });
        notify(`${job.company} needs the code from your email`, why);
        say(`${job.company}: waiting for Owen to type the emailed code`);
      },
    });
    if (sf.fallback && submitting) {
      // Auto-submit never hands a job to the Chrome worker: it is slow and has reported "done" on forms it
      // hadn't finished. The job waits for Owen instead (Fill on it still gets the worker).
      set(jobId, { state: "needs_you", note: `Not submitted: the script couldn't fill this form (${sf.why}). Use Fill on it, or apply by hand.`, url: job.applyUrl, finishedAt: new Date().toISOString() });
      say(`${job.company}: script passed (${sf.why}); not submitting without it`);
      return;
    } else if (sf.fallback) {
      say(`${job.company}: script passed (${sf.why}); using the Chrome worker`);
    } else {
      r = sf.r;
      timings.push(sf.timing);
      costUsd += sf.costUsd;
    }
  }
  if (!r && submitting) {
    // No script fill to rest on (no form link, or Finish on an open tab): never let the worker submit.
    set(jobId, { state: "needs_you", note: "Not submitted: only the script auto-submits, and it couldn't take this one. Use Fill, or apply by hand.", url: job.applyUrl, finishedAt: new Date().toISOString() });
    say(`${job.company}: no script fill; not submitting`);
    return;
  }
  if (!r) {
    if (!(await chromeReady())) {
      // Only this job is held back: the rest of the run carries on, and Finish retries it once Chrome is back.
      set(jobId, { state: "needs_you", note: `This one needs the Chrome worker. ${CHROME_DOWN}`, url: job.applyUrl, finishedAt: new Date().toISOString() });
      say(`${job.company}: needs the Chrome worker, which isn't connected`);
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
  } else if (fresh && /^Skipped: /.test(r.note ?? "")) {
    // An in-person 8+ month placement the page's title gave away (SOTI "May 2027 - 12 Months"): off the queue.
    fresh.skippedAt = new Date().toISOString();
    writeJob(fresh);
  } else if (fresh && r.url && !isThirdParty(r.url) && !fresh.applyUrl) {
    fresh.applyUrl = r.url;
    fresh.applyUrlNote = "found by the Chrome worker";
    writeJob(fresh);
  } else if (fresh?.applyUrl && r.url && /myworkdayjobs\.com|myworkdaysite\.com/i.test(r.url) && new URL(r.url).hostname !== new URL(fresh.applyUrl).hostname) {
    // The link was a redirect (a shortlink like go.vansh.nyc): keep the Workday posting itself, so the next run
    // finds this job's open, signed-in tab instead of opening another one.
    fresh.applyUrl = r.url.replace(/\/apply(\/.*)?$/, "").replace(/\/login\?.*$/, "");
    fresh.applyUrlNote = "the shortlink's Workday posting";
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
  // --resume and --verify always use the extension, so they check first and leave their jobs as they were. A normal
  // fill never stops here: most jobs don't touch the extension, and one that does finds out in prefillOne.
  if (resuming || verifying) {
    const check = await chromeCheck();
    if (!check.ok) {
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
  if (!resuming) await closeStaleTabs();
  // Auto-submit never applies twice: a job Owen already applied to by hand (a confirmation email) is set aside.
  let skipIds = new Set<string>();
  if (submitting && !resuming) {
    const jobs = ids.map((id) => readJob(id)).filter((j): j is NonNullable<typeof j> => Boolean(j)).map((j) => ({ id: j.id, company: j.company, role: j.role }));
    // Roles already applied to at the same companies: an email that names no role can't be pinned on this run's job (Plusgrade, 2026-11-06).
    const names = new Set(jobs.map((j) => j.company.toLowerCase()));
    const done = listJobs().filter((o) => o.submittedAt && names.has(o.company.toLowerCase())).map((o) => ({ id: o.id, company: o.company, role: o.role }));
    let { hits, error } = await alreadyApplied(jobs, done);
    if (error) ({ hits, error } = await alreadyApplied(jobs, done));
    if (error) {
      // No duplicate check, no submit: this run fills and stops at Review, so nothing can go in twice.
      allowSubmit = false;
      say(`(couldn't check Gmail for earlier applications: ${error.slice(0, 120)}; filling only, nothing will be submitted this run)`);
    }
    for (const h of hits) {
      set(h.id, { state: "needs_you", note: `Looks like you already applied (${h.evidence}). Not submitted again: hit "I applied", or Fill if that email is for a different role.`, finishedAt: new Date().toISOString() });
      say(`${readJob(h.id)?.company}: already applied (${h.evidence}); skipped`);
    }
    skipIds = new Set(hits.map((h) => h.id));
  }
  const todo = ids.filter((id) => !skipIds.has(id));
  const handled = new Set(ids);
  let active = 0;
  if (allMode) writeFileSync(ALL_FLAG, String(process.pid));
  // One job per site at a time: two applications on the same Workday tenant share one sign-in, and running them
  // together broke both (Altera 2026-11-04: server 500s, a page that wouldn't move on, a missing upload box).
  const hostOf = (id: string) => {
    const j = readJob(id);
    try {
      return new URL(j?.applyUrl ?? j?.url ?? "").hostname;
    } catch {
      return id;
    }
  };
  const busy = new Map<string, number>();
  let limitReached = false;
  const next = (): string | undefined | null => {
    // Jobs Owen has answered since the run began go first, so they finish while he's still at the screen.
    for (const id of takeFinishQueue()) {
      handled.add(id);
      todo.unshift(id);
    }
    // Claude's usage limit ran out: every job after this would fail the same way, so none starts.
    if (limitReached) return undefined;
    if (!todo.length) return undefined;
    const i = todo.findIndex((id) => !busy.get(hostOf(id)));
    if (i < 0) return null; // everything left is on a site another worker is using: wait for it
    return todo.splice(i, 1)[0];
  };
  const worker = async (n: number) => {
    // Stagger the starts so ten sessions don't all attach to Chrome in the same instant.
    await new Promise((res) => setTimeout(res, n * 1500));
    for (;;) {
      const id = next();
      if (id === null) {
        await new Promise((res) => setTimeout(res, 2000));
        continue;
      }
      if (!id) {
        // Nothing left to start. Other workers may still be on a job that will need a hand: stay a moment so a
        // finished question isn't turned away, but stop once everything has settled.
        if (!allMode || active === 0) break;
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      active++;
      const host = hostOf(id);
      busy.set(host, (busy.get(host) ?? 0) + 1);
      // Watchdog: a tab that freezes (AltaLink's Workable form, 2026-11-04) stalls its job and blocks every new
      // connection to the filler Chrome. Past 12 minutes, close this job's tab: the job stops ("needs you"),
      // stays in the queue, and the run carries on. Oracle's code wait (up to 15 min) gets longer.
      const limitMs = /oraclecloud|jdirving/i.test(host) ? 20 * 60_000 : 12 * 60_000;
      const dog = setTimeout(async () => {
        try {
          const tabs = (await (await fetch("http://127.0.0.1:9333/json/list")).json()) as { id: string; type: string; url: string }[];
          for (const t of tabs) if (t.type === "page" && t.url.includes(host)) await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);
          say(`${readJob(id)?.company ?? id}: no progress after ${limitMs / 60_000} min; closed its tab so the run can go on`);
        } catch {
          // Chrome not answering: nothing more to do here
        }
      }, limitMs);
      try {
        await prefillOne(id);
        const p = readPrefill(id);
        if (/^Paused: Claude's usage limit/.test(p?.note ?? "") && !limitReached) {
          limitReached = true;
          say(`Claude's usage limit ran out; not starting the ${todo.length} jobs left. Run them again after it resets.`);
        }
        logStats(id);
        if (allMode && p?.state === "needs_you" && p.questions?.length) {
          const j = readJob(id);
          notify(`${j?.company ?? "A job"} needs an answer`, `${p.questions[0].q.slice(0, 120)}${p.questions.length > 1 ? ` (+${p.questions.length - 1} more)` : ""} Answer it on the Apply queue; the others keep going.`);
        }
      } catch (err) {
        set(id, { state: "failed", note: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() });
      } finally {
        clearTimeout(dog);
        active--;
        busy.set(host, (busy.get(host) ?? 1) - 1);
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
  say(`Done: ${sent ? `${sent} submitted, ` : ""}${ready - sent} ready, ${needs} need Owen, ${failed} failed`);
}

main()
  .catch((err) => say(`✗ ${err instanceof Error ? err.message : err}`))
  .finally(() => {
    rmSync(PREFILL_LOCK, { force: true });
    rmSync(ALL_FLAG, { force: true });
    process.exit(0);
  });

/**
 * Tabs left by earlier runs pile up (20 open ran the PC out of memory, 2026-11-06). Before a run, close every tab
 * whose job is done (applied, skipped, closed) or that matches no open job; tabs of jobs still waiting on Owen stay.
 */
async function closeStaleTabs() {
  try {
    const key = (u: string) => {
      try {
        const url = new URL(u);
        const n = decodeURIComponent(url.pathname + url.search + url.hash).match(/[0-9]{5,}/g) ?? [];
        return n.map((x) => `${url.hostname.split(".").slice(-3).join(".")}|${x}`);
      } catch {
        return [];
      }
    };
    const open = new Set<string>();
    for (const j of listJobs()) if (!j.submittedAt && !j.skippedAt && !j.closedAt) for (const k of [...key(j.applyUrl ?? ""), ...key(j.url ?? "")]) open.add(k);
    const tabs = (await (await fetch("http://127.0.0.1:9333/json/list", { signal: AbortSignal.timeout(3000) })).json()) as { id: string; type: string; url: string }[];
    let n = 0;
    for (const t of tabs) {
      if (t.type !== "page" || !/^https?:/.test(t.url)) continue;
      // Waiting on Owen's emailed code, or a job still open: keep it.
      if (key(t.url).some((k) => open.has(k))) continue;
      await fetch(`http://127.0.0.1:9333/json/close/${t.id}`).catch(() => null);
      n++;
    }
    if (n) say(`Closed ${n} leftover tab${n === 1 ? "" : "s"} from earlier runs`);
  } catch {
    // the filler's Chrome isn't up yet: nothing to close
  }
}
