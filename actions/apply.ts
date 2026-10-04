"use server";

import { writeFileSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { spawnHidden } from "@/lib/spawnHidden";
import { createJob, jobDir, readJob, writeJob, type Job } from "@/lib/autoapply/job";
import { isResumeBase, type ResumeBase } from "@/lib/autoapply/base";
import { setStage, trackPosting } from "@/actions/applications";
import { findOrCreateManualPosting } from "@/lib/postings";
import { toggleSave } from "@/actions/saved";
import type { OrgKind } from "@/lib/types";

// Everything here is local-only: it starts scripts/autoapply.ts, which tailors the resume and writes
// a cover letter with the `claude` CLI and pdfLaTeX. Owen opens the posting in his own Chrome and
// applies himself; nothing here fills or submits forms.

function assertEnabled() {
  if (process.env.AUTO_APPLY_ENABLED !== "1") throw new Error("Resume tailoring only runs locally (AUTO_APPLY_ENABLED=1).");
}

/** Starts the runner in the background; it exits when the documents are done. */
function spawnRunner(jobId: string, mode?: "cover" | "rebase") {
  const root = process.cwd();
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const args = [tsxCli, path.join(root, "scripts", "autoapply.ts"), jobId, ...(mode ? [`--${mode}`] : [])];
  spawnHidden(process.execPath, args, { cwd: root, logFile: path.join(jobDir(jobId), "runner.log") });
}

async function start(input: Pick<Job, "source" | "company" | "role" | "url" | "region">, postingText?: string | null): Promise<string> {
  assertEnabled();
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new Error(`Not a valid URL: ${input.url}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) postings can be tailored for.");
  const job = createJob(input);
  // The Jobs list already read most postings; hand the text over so the runner needn't fetch it.
  if (postingText?.trim()) writeFileSync(path.join(jobDir(job.id), "jd.txt"), postingText);
  spawnRunner(job.id);
  revalidatePath("/apply");
  return job.id;
}

export async function startAutoApplyPosting(postingId: string): Promise<string> {
  const p = await prisma.coopPosting.findUniqueOrThrow({
    where: { id: postingId },
    select: { id: true, company: true, role: true, url: true, region: true, details: true, detailsStatus: true },
  });
  return start({ source: { kind: "coop", id: p.id }, company: p.company, role: p.role, url: p.url, region: p.region }, p.detailsStatus === "ok" ? p.details : null);
}

export async function startAutoApplyOrg(orgId: string): Promise<string> {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true, url: true, applyUrl: true, kind: true, description: true } });
  const role = o.kind === "design_team" ? "Design team member" : o.kind === "hackathon" ? "Hacker" : "Club member";
  return start({ source: { kind: "org", id: o.id }, company: o.name, role, url: o.applyUrl ?? o.url }, o.description || null);
}

/** For postings that aren't in the Jobs list: paste a link (and the description, if the site can't be read). */
export async function startAutoApplyUrl(formData: FormData): Promise<string> {
  const url = String(formData.get("url") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || new URL(url).hostname.replace(/^www./, "");
  const role = String(formData.get("role") ?? "").trim() || "Application";
  const description = String(formData.get("description") ?? "").trim();
  return start({ source: { kind: "coop", id: "manual" }, company, role, url }, description || null);
}

/** Write a cover letter for a run that skipped it (the posting didn't ask for one). */
export async function requestCoverLetter(jobId: string): Promise<void> {
  assertEnabled();
  const job = readJob(jobId);
  if (!job) throw new Error("No such job");
  if (job.status === "running") throw new Error("Wait for the current step to finish first.");
  job.status = "running";
  writeJob(job);
  spawnRunner(jobId, "cover");
}

/** Owen overrides which resume the tailored one starts from: redo the resume (and cover letter, if any). */
export async function rebaseAutoApply(jobId: string, base: ResumeBase): Promise<void> {
  assertEnabled();
  if (!isResumeBase(base)) throw new Error(`Unknown resume: ${String(base)}`);
  const job = readJob(jobId);
  if (!job) throw new Error("No such job");
  if (job.status === "running") throw new Error("Wait for the current step to finish first.");
  job.forcedBase = base;
  job.status = "running";
  job.error = undefined;
  writeJob(job);
  spawnRunner(jobId, "rebase");
}

/**
 * Owen applied on the company's site himself; record it in the application pipeline, noting which
 * tailored resume he sent.
 */
export async function markAutoApplySubmitted(jobId: string): Promise<string | null> {
  assertEnabled();
  const job = readJob(jobId);
  if (!job) throw new Error("No such job");
  const resume = `Tailored (${job.resumeBase ?? "software"} base, ${job.id})`;

  let savedId: string | null = null;
  if (job.source.kind === "coop" && job.source.id !== "manual") {
    savedId = await trackPosting(job.source.id, "applied");
  } else if (job.source.kind === "coop") {
    // A pasted link isn't in the Jobs list yet: add it (or reuse the same job if it's already
    // there under another source) so the application still shows up under Applied.
    const posting = await findOrCreateManualPosting({ company: job.company, role: job.role, url: job.url });
    savedId = await trackPosting(posting.id, "applied");
    await prisma.savedItem.update({ where: { id: savedId }, data: { channel: "direct" } });
  } else if (job.source.kind === "org") {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: job.source.id }, select: { kind: true } });
    let saved = await prisma.savedItem.findUnique({ where: { organizationId: job.source.id }, select: { id: true } });
    if (!saved) {
      await toggleSave(org.kind as OrgKind, job.source.id);
      saved = await prisma.savedItem.findUnique({ where: { organizationId: job.source.id }, select: { id: true } });
    }
    if (saved) {
      await setStage(saved.id, "applied");
      savedId = saved.id;
    }
  }
  if (savedId) await prisma.savedItem.update({ where: { id: savedId }, data: { resume } });

  job.submittedAt = new Date().toISOString();
  job.applicationId = savedId ?? undefined;
  writeJob(job);
  revalidatePath("/", "layout");
  return savedId;
}
