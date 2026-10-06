/**
 * Scores a tailored resume the way the runner's quality loop does, without changing anything:
 *   npx tsx scripts/resume-score.ts <jobId> [--json]
 * With no job id, scores the five newest jobs that have a resume.pdf.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { listJobs, jobDir } from "../lib/autoapply/job";
import { pdfToText } from "../lib/autoapply/latex";
import { scoreResume, verdict } from "../lib/autoapply/ats";
import { resumeSourceText } from "../lib/autoapply/facts";
import { RESUME_BASES } from "../lib/autoapply/base";

async function score(id: string, json: boolean) {
  const dir = jobDir(id);
  const job = JSON.parse(readFileSync(path.join(dir, "job.json"), "utf8"));
  const r = (f: string) => readFileSync(path.join(dir, f), "utf8");
  const report = scoreResume({
    tex: r("resume.tex"),
    pdfText: await pdfToText(path.join(dir, "resume.pdf")),
    layoutText: await pdfToText(path.join(dir, "resume.pdf"), { layout: true }),
    jd: r("jd.txt"),
    role: job.role,
    sourceText: resumeSourceText({ tex: RESUME_BASES.map((b) => r(`${b}.tex`)), experienceMd: r("experience.md") }),
  });
  const v = verdict(report, job.ats?.review ?? null);
  if (json) return console.log(JSON.stringify({ id, report, v }, null, 2));
  console.log(`\n=== ${job.company}: ${job.role}`);
  console.log(`parse ${report.parse} | keywords ${report.keywords} (raw ${report.rawMatch}) | scan ${report.scan} | overall ${v.overall} | ${v.passed ? "PASS" : `below: ${v.shortfalls.join("; ")}`}`);
  console.log(`top keywords: ${report.hits.filter((h) => h.attainable).slice(0, 12).map((h) => `${h.name}${h.found ? (h.inContext ? "" : "(skills)") : "(MISSING)"}:${h.weight}`).join(", ")}`);
  if (report.unattainable.length) console.log(`not backed by experience: ${report.unattainable.join(", ")}`);
  for (const i of report.issues) console.log(`  [${i.area}${i.fixable ? "" : ", info"}] ${i.msg}`);
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const ids = args.filter((a) => !a.startsWith("--"));
const targets = ids.length ? ids : listJobs().filter((j) => existsSync(path.join(jobDir(j.id), "resume.pdf"))).slice(0, 5).map((j) => j.id);
(async () => {
  for (const id of targets) await score(id, json);
})();
