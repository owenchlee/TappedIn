/**
 * Resume and cover letter runner. Started in the background by actions/apply.ts as:
 *   node node_modules/tsx/dist/cli.mjs scripts/autoapply.ts <jobId> [--cover | --rebase]
 * or by hand, without the app:
 *   npx tsx scripts/autoapply.ts --new <url> "<company>" "<role>"
 *
 * Reads the posting (jd.txt, written by the app from the Jobs list, else fetched from the job site),
 * tailors the resume (LaTeX, compiled with pdfLaTeX so it matches Overleaf) and writes a cover letter
 * when the posting asks for one. Owen opens the posting in his own Chrome and applies himself (with
 * Simplify); nothing here touches a browser or submits anything.
 *   --cover   write a cover letter now (Owen asked for one)
 *   --rebase  redo the resume from job.forcedBase, and the cover letter if there is one
 *
 * Lives outside Next's bundle on purpose: the `claude` CLI and pdfLaTeX only exist locally.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PRIVATE_DIR, createJob, jobDir, readJob, writeJob, type Job, type StepName, type StepState } from "../lib/autoapply/job";
import { bodyProblems, compileTex, enforcePreamble, fontsFromLog } from "../lib/autoapply/latex";
import { factProblems, letterNumberProblems } from "../lib/autoapply/facts";
import { runClaude, usedHumanizer } from "../lib/autoapply/claude";
import { coverLetterPrompt, letterFixPrompt, fixPrompt, humanizeRetryPrompt, problemsPrompt, tailorPrompt, trimPrompt } from "../lib/autoapply/prompts";
import { coverLetterTex } from "../lib/autoapply/coverLetterTex";
import { eligibilityWarnings } from "../lib/autoapply/eligibility";
import { RESUME_BASES, RESUME_BASE_LABELS, baseFromTitle, parseBaseLine, parseWhyLine } from "../lib/autoapply/base";
import { fetchPostingDetail } from "../lib/details/fetch";

const TEMPLATES_DIR = path.join(PRIVATE_DIR, "resume", "templates");
const RESUME_FILE = "Owen_Lee_Resume.pdf";
const COVER_FILE = "Owen_Lee_Cover_Letter.pdf";

const argv = process.argv.slice(2);
const mode = argv.includes("--cover") ? "cover" : argv.includes("--rebase") ? "rebase" : "full";
const jobId =
  argv[0] === "--new"
    ? createJob({ source: { kind: "coop", id: "manual" }, url: argv[1], company: argv[2] ?? "Unknown company", role: argv[3] ?? "Unknown role" }).id
    : argv[0];

let job: Job;
let dir: string;

function log(msg: string) {
  console.log(`[tailor ${new Date().toISOString()}] ${msg}`);
  job.log.push({ at: new Date().toISOString(), msg });
  writeJob(job);
}

function step(name: StepName, state: StepState, detail?: string) {
  job.steps[name] = { state, detail };
  writeJob(job);
}

const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const has = (f: string) => existsSync(path.join(dir, f));

/** The posting text: already saved by the app, or read from the job site's API / page. */
async function readPosting() {
  step("open", "running", "Reading the posting");
  if (!has("jd.txt") || !read("jd.txt").trim()) {
    const result = await fetchPostingDetail(job.url);
    if (result.status !== "ok") {
      const why = result.status === "gone" ? "the job site says it's no longer posted" : result.reason;
      throw new Error(`Couldn't read the posting (${why}). Paste the job description on the Resumes page and try again.`);
    }
    writeFileSync(path.join(dir, "jd.txt"), result.text);
  }
  job.warnings = eligibilityWarnings(read("jd.txt"), job.region);
  if (job.warnings.length) log(`Heads up: ${job.warnings.join("; ")}`);
  step("open", "done", `Read the posting (${read("jd.txt").split(/\s+/).length} words)`);
}

async function tailorResume() {
  step("tailor", "running", "Claude is tailoring the resume");
  const run = await runClaude({ cwd: dir, prompt: tailorPrompt(job), allowedTools: ["Read", "Write", "Edit", "Skill"] });
  log(`tailor run: ${run.ok ? "ok" : "failed"}, $${run.costUsd.toFixed(2)}`);
  if (!run.ok || !has("resume.tex")) throw new Error(`Resume tailoring failed: ${run.error ?? "no resume.tex written"}`);

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
      copyFileSync(path.join(dir, "resume.pdf"), path.join(dir, "upload", RESUME_FILE));
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

function decideCoverLetter(jd: string, asked: boolean): { needed: boolean; reason: string } {
  if (asked) return { needed: true, reason: "You asked for one" };
  if (JD_REQUIRES_COVER.test(jd)) return { needed: true, reason: "The posting asks for a cover letter" };
  return { needed: false, reason: "The posting doesn't ask for one" };
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
  copyFileSync(path.join(dir, "cover-letter.pdf"), path.join(dir, "upload", COVER_FILE));

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

async function main() {
  const loaded = jobId ? readJob(jobId) : null;
  if (!loaded) throw new Error(`No job ${jobId}`);
  job = loaded;
  dir = jobDir(job.id);
  job.status = "running";
  job.error = undefined;
  writeJob(job);

  copyFileSync(path.join(PRIVATE_DIR, "experience.md"), path.join(dir, "experience.md"));
  for (const b of RESUME_BASES) copyFileSync(path.join(TEMPLATES_DIR, `${b}.tex`), path.join(dir, `${b}.tex`));

  if (mode === "cover") {
    job.coverLetter = decideCoverLetter("", true);
    await writeCoverLetter();
  } else if (mode === "rebase") {
    log(`Redoing the resume from your ${RESUME_BASE_LABELS[job.forcedBase ?? "software"].toLowerCase()} resume`);
    for (const f of ["resume.tex", "notes.md", `upload/${RESUME_FILE}`]) rmSync(path.join(dir, f), { force: true });
    await tailorResume();
    if (job.coverLetter?.needed) await writeCoverLetter(); // the letter complements the resume, so redo it too
  } else {
    // A redo keeps the last good documents aside until the new ones are made (restored on failure,
    // e.g. when Claude's usage limit runs out mid-batch).
    rmSync(path.join(dir, "upload.prev"), { recursive: true, force: true });
    if (has("upload")) renameSync(path.join(dir, "upload"), path.join(dir, "upload.prev"));
    await readPosting();
    await tailorResume();
    job.coverLetter = decideCoverLetter(read("jd.txt"), false);
    if (job.coverLetter.needed) await writeCoverLetter();
    else step("cover_letter", "skipped", job.coverLetter.reason);
  }
  rmSync(path.join(dir, "upload.prev"), { recursive: true, force: true });
  job.status = "ready";
  log("Ready. Nothing was sent anywhere.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    if (job) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      for (const name of Object.keys(job.steps) as StepName[]) if (job.steps[name]?.state === "running") job.steps[name].state = "failed";
      // A failed redo puts the last good documents back, so the job stays usable.
      if (mode === "full" && has(`upload.prev/${RESUME_FILE}`)) {
        rmSync(path.join(dir, "upload"), { recursive: true, force: true });
        renameSync(path.join(dir, "upload.prev"), path.join(dir, "upload"));
        job.status = "ready";
        job.log.push({ at: new Date().toISOString(), msg: "Redo failed; kept the previous documents" });
      }
      // A failed cover letter or redo still leaves the earlier resume usable.
      if (mode !== "full" && has(`upload/${RESUME_FILE}`)) job.status = "ready";
      writeJob(job);
    }
    process.exit(1);
  });
