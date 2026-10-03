/**
 * Auto-apply runner. Started detached by actions/apply.ts as:
 *   node node_modules/tsx/dist/cli.mjs scripts/autoapply.ts <jobId> [--fill-only]
 * or by hand, without the app:
 *   npx tsx scripts/autoapply.ts --new <url> "<company>" "<role>"
 *
 * Opens the posting in a real Chrome window right away, tailors the resume (LaTeX, compiled with
 * pdfLaTeX so it matches Overleaf), writes a cover letter only when the application needs one,
 * fills the form, and then stops. It never clicks Submit. It stays alive until the window is
 * closed, listening for commands the app drops into command.json (refill / cover / rebase / close).
 *
 * Lives outside Next's bundle on purpose: Playwright and the `claude` CLI only exist locally.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { PRIVATE_DIR, createJob, jobDir, readJob, writeJob, type FieldReport, type Job, type JobCommand, type StepName, type StepState } from "../lib/autoapply/job";
import { bodyProblems, compileTex, enforcePreamble, fontsFromLog } from "../lib/autoapply/latex";
import { factProblems, letterNumberProblems } from "../lib/autoapply/facts";
import { runClaude, usedHumanizer } from "../lib/autoapply/claude";
import { answersPrompt, coverLetterPrompt, letterFixPrompt, fixPrompt, humanizeRetryPrompt, problemsPrompt, tailorPrompt, trimPrompt } from "../lib/autoapply/prompts";
import { fillField, hasApplicationForm, pageText, scanPage, type FormField } from "../lib/autoapply/form";
import { mapField, type Profile } from "../lib/autoapply/profileMap";
import { coverLetterTex } from "../lib/autoapply/coverLetterTex";
import { RESUME_BASES, RESUME_BASE_LABELS, baseFromTitle, isResumeBase, parseBaseLine, parseWhyLine } from "../lib/autoapply/base";

const TEMPLATES_DIR = path.join(PRIVATE_DIR, "resume", "templates");
const BROWSER_PROFILE = path.join(PRIVATE_DIR, "browser-profile");
const RESUME_UPLOAD_NAME = "Owen_Lee_Resume.pdf";
const COVER_UPLOAD_NAME = "Owen_Lee_Cover_Letter.pdf";
const MAX_LIFETIME_MS = 3 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const fillOnly = argv.includes("--fill-only");
const jobId =
  argv[0] === "--new"
    ? createJob({ source: { kind: "coop", id: "manual" }, url: argv[1], company: argv[2] ?? "Unknown company", role: argv[3] ?? "Unknown role" }).id
    : argv[0];

let job: Job;
let dir: string;

function log(msg: string) {
  console.log(`[autoapply ${new Date().toISOString()}] ${msg}`);
  job.log.push({ at: new Date().toISOString(), msg });
  writeJob(job);
}

function step(name: StepName, state: StepState, detail?: string) {
  job.steps[name] = { state, detail };
  writeJob(job);
}

const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const has = (f: string) => existsSync(path.join(dir, f));

// ---------------------------------------------------------------------------------------------
// Browser

async function launch(): Promise<{ context: BrowserContext; page: Page }> {
  mkdirSync(BROWSER_PROFILE, { recursive: true });
  // A dedicated profile (not Owen's everyday Chrome profile, which Chrome locks while open).
  // Logins made here, e.g. Workday accounts, persist between applications.
  const context = await chromium
    .launchPersistentContext(BROWSER_PROFILE, {
      channel: "chrome",
      headless: false,
      viewport: null,
      args: ["--start-maximized"],
    })
    .catch((err: Error) => {
      // One profile means one auto-apply window at a time; Chrome refuses a second instance.
      if (/existing browser session|already in use/i.test(err.message)) {
        throw new Error("Another auto-apply Chrome window is still open. Close it (or finish that application) and try again.");
      }
      throw err;
    });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
}

const APPLY_NAME = /^\s*apply(\s+(now|here|online|for this (job|position|role)|to this (job|position|role)))?\s*$/i;

/** Gets from the posting page to the page with the actual form (at most two hops). */
async function findForm(page: Page): Promise<{ page: Page; fields: FormField[] }> {
  let fields = await scanPage(page);
  for (let hop = 0; hop < 2 && !hasApplicationForm(fields); hop++) {
    const url = new URL(page.url());
    if (url.hostname === "jobs.lever.co" && !url.pathname.endsWith("/apply")) {
      await page.goto(`${url.origin}${url.pathname.replace(/\/$/, "")}/apply`);
    } else if (url.hostname === "jobs.ashbyhq.com" && !url.pathname.endsWith("/application")) {
      await page.goto(`${url.origin}${url.pathname.replace(/\/$/, "")}/application`);
    } else {
      const btn = page.getByRole("link", { name: APPLY_NAME }).or(page.getByRole("button", { name: APPLY_NAME })).first();
      if (!(await btn.isVisible({ timeout: 2_000 }).catch(() => false))) break;
      const popup = page.context().waitForEvent("page", { timeout: 5_000 }).catch(() => null);
      await btn.click();
      const opened = await popup;
      if (opened) page = opened;
    }
    await settle(page);
    fields = await scanPage(page);
  }
  return { page, fields };
}

async function looksLikeLogin(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    if (await frame.locator("input[type=password]").count().catch(() => 0)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Documents

function normLabel(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function answersByLabel(): Record<string, unknown> {
  return has("answers-by-label.json") ? JSON.parse(read("answers-by-label.json")) : {};
}

/** Turns Claude's id-keyed answers.json into label-keyed answers that survive page re-scans. */
function mergeAnswers(questions: FormField[]) {
  if (!has("answers.json")) return;
  let byId: Record<string, unknown>;
  try {
    byId = JSON.parse(read("answers.json"));
  } catch {
    log("answers.json was not valid JSON; ignoring it");
    return;
  }
  const byLabel = answersByLabel();
  for (const q of questions) if (q.key in byId) byLabel[normLabel(q.label)] = byId[q.key];
  writeFileSync(path.join(dir, "answers-by-label.json"), JSON.stringify(byLabel, null, 2));
}

function questionsFor(fields: FormField[], profile: Profile, known: Record<string, unknown>): FormField[] {
  return fields.filter(
    (f) =>
      f.kind !== "file" &&
      f.label &&
      !(normLabel(f.label) in known) &&
      mapField(f, profile, { resume: "x", coverLetter: "x", coverLetterText: "x" }).kind === "unmapped",
  );
}

function writeQuestions(questions: FormField[]) {
  const payload = questions.map((q) => ({ id: q.key, question: q.label, type: q.kind, required: q.required, options: q.options }));
  writeFileSync(path.join(dir, "questions.json"), JSON.stringify(payload, null, 2));
}

async function tailorResume(fields: FormField[], profile: Profile) {
  step("tailor", "running", "Claude is tailoring the resume");
  const questions = questionsFor(fields, profile, {});
  writeQuestions(questions);

  const run = await runClaude({ cwd: dir, prompt: tailorPrompt(job), allowedTools: ["Read", "Write", "Edit", "Skill"] });
  log(`tailor run: ${run.ok ? "ok" : "failed"}, $${run.costUsd.toFixed(2)}`);
  if (!run.ok || !has("resume.tex")) throw new Error(`Resume tailoring failed: ${run.error ?? "no resume.tex written"}`);
  mergeAnswers(questions);

  const notes = has("notes.md") ? read("notes.md") : "";
  const picked = parseBaseLine(notes);
  const titleSuggests = baseFromTitle(job.role);
  if (job.forcedBase) {
    job.resumeBase = job.forcedBase;
    job.baseReason = "You chose this resume.";
  } else {
    job.resumeBase = picked ?? titleSuggests ?? "software";
    job.baseReason = parseWhyLine(notes) ?? (picked ? undefined : "Claude didn't name a base, so the job title decided.");
  }
  // Second opinion from the title alone, so a wrong pick is flagged instead of silently used.
  // Owen's own override is never flagged.
  job.baseCheck = { titleSuggests, agrees: job.forcedBase != null || titleSuggests == null || titleSuggests === job.resumeBase };
  log(`Base resume: ${job.resumeBase}${job.forcedBase ? " (your choice)" : ""}; title suggests ${titleSuggests ?? "nothing clear"}`);
  job.tailorNotes = notes.replace(/^Base:.*\n?/im, "").replace(/^Why:.*\n?/im, "").trim();
  const baseTex = readFileSync(path.join(TEMPLATES_DIR, `${job.resumeBase}.tex`), "utf8");
  const factSources = {
    tex: RESUME_BASES.map((b) => readFileSync(path.join(TEMPLATES_DIR, `${b}.tex`), "utf8")),
    experienceMd: read("experience.md"),
  };

  // The base compiled the way Overleaf compiles it: the tailored resume must not use any font face or
  // size the original doesn't (e.g. a \small slipped in to squeeze onto one page).
  const baseCompile = await compileTex(dir, `${job.resumeBase}.tex`);
  const baseFonts = baseCompile.ok ? fontsFromLog(dir, `${job.resumeBase}.tex`) : null;
  if (!baseFonts) log("Couldn't compile the base resume for the font check; skipping it");

  for (let attempt = 0; attempt < 4; attempt++) {
    const { tex, restored } = enforcePreamble(baseTex, read("resume.tex"));
    if (restored) {
      log("Model edited the preamble; restored the Overleaf original");
      writeFileSync(path.join(dir, "resume.tex"), tex);
    }
    // Every number, skill and entry must be backed by a base resume or experience.md.
    const problems = [...bodyProblems(tex), ...factProblems(tex, factSources)];
    const compiled = await compileTex(dir, "resume.tex");
    let followUp: string | null = null;
    if (!compiled.ok) followUp = fixPrompt(compiled.error ?? "unknown error");
    else if ((compiled.pages ?? 1) > 1) followUp = trimPrompt(compiled.pages!);
    else {
      const extra = baseFonts?.size ? [...fontsFromLog(dir, "resume.tex")].filter((f) => !baseFonts.has(f)) : [];
      if (extra.length) {
        problems.push(
          `uses font sizes or styles the original resume doesn't (${extra.join(", ")}); remove any size or font command (such as \\small, \\footnotesize, \\scriptsize) that the base doesn't have`,
        );
      }
      if (problems.length) followUp = problemsPrompt(problems);
    }

    if (!followUp) {
      mkdirSync(path.join(dir, "upload"), { recursive: true });
      copyFileSync(path.join(dir, "resume.pdf"), path.join(dir, "upload", RESUME_UPLOAD_NAME));
      step("tailor", "done", `One page, based on your ${RESUME_BASE_LABELS[job.resumeBase].toLowerCase()} resume`);
      return;
    }
    log(`resume check failed (${!compiled.ok ? "compile error" : compiled.pages! > 1 ? `${compiled.pages} pages` : problems.join(", ")}); asking Claude to fix`);
    const fix = await runClaude({ cwd: dir, prompt: followUp, allowedTools: ["Read", "Edit", "Write"] });
    if (!fix.ok) throw new Error(`Resume fix-up failed: ${fix.error}`);
  }
  throw new Error("Resume still failed checks after 4 attempts; see the log");
}

const JD_REQUIRES_COVER =
  /cover letter[^.\n]{0,80}\b(required|mandatory|must)\b|\b(required|must|please (include|submit|attach|upload))\b[^.\n]{0,80}cover letter/i;

function decideCoverLetter(fields: FormField[], jd: string, forced: boolean): { needed: boolean; reason: string } {
  const coverFields = fields.filter((f) => /cover/i.test(f.label) && (f.kind === "file" || f.kind === "textarea"));
  if (forced) return { needed: true, reason: "You asked for one" };
  if (coverFields.some((f) => f.required)) return { needed: true, reason: "The application form requires a cover letter" };
  if (JD_REQUIRES_COVER.test(jd)) return { needed: true, reason: "The posting asks for a cover letter" };
  if (coverFields.length) return { needed: false, reason: "The form has an optional cover letter field, so it was skipped" };
  return { needed: false, reason: "Not asked for anywhere in the posting or form" };
}

async function writeCoverLetter() {
  step("cover_letter", "running", "Claude is writing the cover letter, then running /humanizer");
  const run = await runClaude({ cwd: dir, prompt: coverLetterPrompt(job), allowedTools: ["Read", "Write", "Edit", "Skill"] });
  log(`cover letter run: ${run.ok ? "ok" : "failed"}, humanizer ${usedHumanizer(run) ? "used" : "NOT used"}, $${run.costUsd.toFixed(2)}`);
  if (!run.ok || !has("cover-letter.txt")) throw new Error(`Cover letter failed: ${run.error ?? "no file written"}`);

  let humanized = usedHumanizer(run);
  if (!humanized) {
    const retry = await runClaude({ cwd: dir, prompt: humanizeRetryPrompt(), allowedTools: ["Read", "Write", "Edit", "Skill"] });
    humanized = retry.ok && usedHumanizer(retry);
    log(`humanizer retry: ${humanized ? "used" : "still not used"}`);
  }

  const sources = {
    tex: RESUME_BASES.map((b) => readFileSync(path.join(TEMPLATES_DIR, `${b}.tex`), "utf8")),
    experienceMd: read("experience.md"),
  };
  let invented = letterNumberProblems(read("cover-letter.txt"), sources);
  if (invented.length) {
    log(`cover letter uses unbacked numbers (${invented.join(", ")}); asking Claude to fix`);
    await runClaude({ cwd: dir, prompt: letterFixPrompt(invented), allowedTools: ["Read", "Edit", "Write"] });
    invented = letterNumberProblems(read("cover-letter.txt"), sources);
  }

  // Owen's standing rule: never an em dash. Deterministic backstop in case one slipped through.
  const letter = read("cover-letter.txt").replace(/\s*—\s*/g, ", ").trim();
  writeFileSync(path.join(dir, "cover-letter.txt"), `${letter}\n`);
  const words = letter.split(/\s+/).length;

  const baseTex = readFileSync(path.join(TEMPLATES_DIR, `${job.resumeBase ?? "software"}.tex`), "utf8");
  writeFileSync(path.join(dir, "cover-letter.tex"), coverLetterTex(letter, baseTex));
  const compiled = await compileTex(dir, "cover-letter.tex");
  if (!compiled.ok) throw new Error(`Cover letter PDF failed to compile: ${compiled.error}`);
  mkdirSync(path.join(dir, "upload"), { recursive: true });
  copyFileSync(path.join(dir, "cover-letter.pdf"), path.join(dir, "upload", COVER_UPLOAD_NAME));

  job.coverLetter = { ...job.coverLetter!, humanized };
  const issues = [
    ...(humanized ? [] : ["/humanizer did not run"]),
    ...(invented.length ? [`numbers not backed by your resume or experience.md: ${invented.join(", ")}`] : []),
  ];
  step(
    "cover_letter",
    issues.length ? "failed" : "done",
    issues.length ? `${words} words, but ${issues.join("; ")}. Review it before sending` : `${words} words, humanized`,
  );
}

// ---------------------------------------------------------------------------------------------
// Filling

async function answerNewQuestions(fields: FormField[], profile: Profile) {
  const questions = questionsFor(fields, profile, answersByLabel());
  if (!questions.length) return;
  writeQuestions(questions);
  rmSync(path.join(dir, "answers.json"), { force: true });
  log(`${questions.length} new question(s) on this page; asking Claude`);
  const run = await runClaude({ cwd: dir, prompt: answersPrompt(job), allowedTools: ["Read", "Write", "Skill"] });
  if (run.ok) mergeAnswers(questions);
}

async function fillPage(page: Page, fields: FormField[], profile: Profile) {
  step("fill", "running", "Filling the form");
  if (await looksLikeLogin(page)) {
    log("This page wants a login; skipping password fields");
  }
  const files = {
    resume: path.join(dir, "upload", RESUME_UPLOAD_NAME),
    coverLetter: job.coverLetter?.needed && has(`upload/${COVER_UPLOAD_NAME}`) ? path.join(dir, "upload", COVER_UPLOAD_NAME) : undefined,
    coverLetterText: job.coverLetter?.needed && has("cover-letter.txt") ? read("cover-letter.txt") : undefined,
  };
  const known = answersByLabel();
  const report: FieldReport[] = [];

  for (const f of fields) {
    if (!f.label && f.kind !== "file") continue;
    const label = f.label || "Resume upload";
    const mapped = mapField(f, profile, files);
    let value: unknown = undefined;
    let reason: string | undefined;
    if (mapped.kind === "value") value = mapped.value;
    else if (mapped.kind === "needs_owen") reason = mapped.reason;
    else if (normLabel(f.label) in known) {
      value = known[normLabel(f.label)];
      if (value == null) reason = "Left for you (sensitive or not in your experience)";
    } else reason = f.kind === "file" ? "No matching document" : "No answer available";

    if (value == null || value === "") {
      report.push({ label, filled: false, reason, required: f.required });
      continue;
    }
    try {
      const used = await fillField(page, f, value as never);
      report.push(used ? { label, filled: true, value: used, required: f.required } : { label, filled: false, reason: `Couldn't match "${String(value)}" to an option`, required: f.required });
    } catch (err) {
      report.push({ label, filled: false, reason: `Fill error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, required: f.required });
    }
  }

  job.fields = report;
  const missingRequired = report.filter((r) => !r.filled && r.required).length;
  step(
    "fill",
    "done",
    `Filled ${report.filter((r) => r.filled).length} of ${report.length} fields${missingRequired ? `, ${missingRequired} required left for you` : ""}. Review, then click Submit yourself.`,
  );
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const loaded = jobId ? readJob(jobId) : null;
  if (!loaded) throw new Error(`No job ${jobId}`);
  job = loaded;
  dir = jobDir(job.id);
  job.status = "running";
  job.error = undefined;
  writeJob(job);

  const profile = JSON.parse(readFileSync(path.join(PRIVATE_DIR, "profile.json"), "utf8")) as Profile;
  copyFileSync(path.join(PRIVATE_DIR, "experience.md"), path.join(dir, "experience.md"));
  for (const b of RESUME_BASES) copyFileSync(path.join(TEMPLATES_DIR, `${b}.tex`), path.join(dir, `${b}.tex`));
  // A full run rebuilds the documents (e.g. after Owen picked a different base while the window was closed).
  if (!fillOnly) rmSync(path.join(dir, "upload"), { recursive: true, force: true });

  step("open", "running", "Opening the posting in Chrome");
  const { context, page: first } = await launch();
  let page = first;
  let closed = false;
  context.on("close", () => {
    closed = true;
  });

  try {
    await page.goto(job.url, { timeout: 45_000 });
    await settle(page);
    if (!has("jd.txt") || !fillOnly) writeFileSync(path.join(dir, "jd.txt"), await pageText(page));
    const found = await findForm(page);
    page = found.page;
    let fields = found.fields;
    step("open", "done", hasApplicationForm(fields) ? `Found the application form (${fields.length} fields)` : "No form found yet; you may need to sign in or click through");

    if (fillOnly && has(`upload/${RESUME_UPLOAD_NAME}`)) {
      step("tailor", "done", "Reused the resume from the earlier run");
    } else {
      await tailorResume(fields, profile);
    }

    const jd = read("jd.txt");
    if (!(fillOnly && job.coverLetter)) job.coverLetter = decideCoverLetter(fields, jd, false);
    if (job.coverLetter!.needed && !has(`upload/${COVER_UPLOAD_NAME}`)) await writeCoverLetter();
    else step("cover_letter", job.coverLetter!.needed ? "done" : "skipped", job.coverLetter!.reason);

    fields = await scanPage(page); // the page may have re-rendered while Claude worked
    await answerNewQuestions(fields, profile);
    await fillPage(page, fields, profile);
    job.status = "ready";
    log("Ready for review. Nothing was submitted.");
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    for (const name of Object.keys(job.steps) as StepName[]) if (job.steps[name].state === "running") job.steps[name].state = "failed";
    log(`Failed: ${job.error}`);
  }

  // Stay alive for follow-up commands until the window is closed (or 3 hours pass).
  const cmdFile = path.join(dir, "command.json");
  const started = Date.now();
  while (!closed && Date.now() - started < MAX_LIFETIME_MS) {
    await new Promise((r) => setTimeout(r, 1_500));
    if (!existsSync(cmdFile)) continue;
    let cmd: JobCommand | null = null;
    try {
      cmd = JSON.parse(readFileSync(cmdFile, "utf8"));
    } catch {}
    rmSync(cmdFile, { force: true });
    if (!cmd) continue;
    try {
      // Whatever tab Owen is looking at now (e.g. page 2 of a Workday form) is the one to fill.
      const pages = context.pages();
      page = pages[pages.length - 1] ?? page;
      if (cmd.command === "close") {
        await context.close();
      } else if (cmd.command === "cover") {
        job.coverLetter = decideCoverLetter([], "", true);
        await writeCoverLetter();
        const fields = await scanPage(page);
        await fillPage(page, fields, profile);
      } else if (cmd.command === "rebase" && isResumeBase(cmd.base)) {
        job.forcedBase = cmd.base;
        job.status = "running";
        log(`Redoing the resume from your ${RESUME_BASE_LABELS[cmd.base].toLowerCase()} resume`);
        for (const f of ["resume.tex", "notes.md", `upload/${RESUME_UPLOAD_NAME}`]) rmSync(path.join(dir, f), { force: true });
        await tailorResume(await scanPage(page), profile);
        if (job.coverLetter?.needed) await writeCoverLetter(); // the letter complements the resume, so redo it too
        await fillPage(page, await scanPage(page), profile);
        job.status = "ready";
      } else if (cmd.command === "refill") {
        log(`Re-filling ${page.url()}`);
        const fields = await scanPage(page);
        await answerNewQuestions(fields, profile);
        await fillPage(page, fields, profile);
      }
      if (job.status === "failed" && has(`upload/${RESUME_UPLOAD_NAME}`)) job.status = "ready";
      writeJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (job.status === "running") {
        job.status = "failed";
        job.error = msg;
        for (const name of Object.keys(job.steps) as StepName[]) if (job.steps[name].state === "running") job.steps[name].state = "failed";
      }
      log(`Command ${cmd.command} failed: ${msg}`);
    }
  }

  job.status = "closed";
  log("Browser closed");
  await context.close().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  if (job) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    for (const name of Object.keys(job.steps) as StepName[]) if (job.steps[name].state === "running") job.steps[name].state = "failed";
    writeJob(job);
  }
  process.exit(1);
});
