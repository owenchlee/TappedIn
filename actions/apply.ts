"use server";

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createJob, jobDir, readJob, writeCommand, writeJob, type Job, type JobCommand } from "@/lib/autoapply/job";
import { isResumeBase, type ResumeBase } from "@/lib/autoapply/base";
import { setStage, trackPosting } from "@/actions/applications";
import { findOrCreateManualPosting } from "@/lib/postings";
import { toggleSave } from "@/actions/saved";
import type { OrgKind } from "@/lib/types";

// Everything here is local-only: it spawns scripts/autoapply.ts, which drives a real Chrome window
// with Playwright and calls the `claude` CLI. Playwright is never imported into Next's bundle.

function assertEnabled() {
  if (process.env.AUTO_APPLY_ENABLED !== "1") throw new Error("Auto-apply is only available when running locally (AUTO_APPLY_ENABLED=1).");
}

/** Starts the detached runner. It outlives dev-server reloads and exits when its Chrome window closes. */
function spawnRunner(jobId: string, fillOnly = false) {
  const root = process.cwd();
  const log = openSync(path.join(jobDir(jobId), "runner.log"), "a");
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const args = [tsxCli, path.join(root, "scripts", "autoapply.ts"), jobId, ...(fillOnly ? ["--fill-only"] : [])];
  const child = spawn(process.execPath, args, { cwd: root, detached: true, stdio: ["ignore", log, log], windowsHide: true });
  child.unref();
}

async function start(input: Pick<Job, "source" | "company" | "role" | "url">): Promise<string> {
  assertEnabled();
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new Error(`Not a valid URL: ${input.url}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) postings can be auto-applied to.");
  const job = createJob(input);
  spawnRunner(job.id);
  revalidatePath("/apply");
  return job.id;
}

export async function startAutoApplyPosting(postingId: string): Promise<string> {
  const p = await prisma.coopPosting.findUniqueOrThrow({ where: { id: postingId }, select: { id: true, company: true, role: true, url: true } });
  return start({ source: { kind: "coop", id: p.id }, company: p.company, role: p.role, url: p.url });
}

export async function startAutoApplyOrg(orgId: string): Promise<string> {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true, url: true, applyUrl: true, kind: true } });
  const role = o.kind === "design_team" ? "Design team member" : o.kind === "hackathon" ? "Hacker" : "Club member";
  return start({ source: { kind: "org", id: o.id }, company: o.name, role, url: o.applyUrl ?? o.url });
}

/** For postings that aren't in Coop Hub yet: paste a link and go. */
export async function startAutoApplyUrl(formData: FormData): Promise<string> {
  const url = String(formData.get("url") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || new URL(url).hostname.replace(/^www\./, "");
  const role = String(formData.get("role") ?? "").trim() || "Application";
  return start({ source: { kind: "coop", id: "manual" }, company, role, url });
}

export async function sendApplyCommand(jobId: string, command: Exclude<JobCommand["command"], "rebase">): Promise<void> {
  assertEnabled();
  if (!readJob(jobId)) throw new Error("No such auto-apply job");
  writeCommand(jobId, command);
}

/**
 * Owen overrides which resume the tailored one starts from. With the window still open the runner
 * redoes the resume (and cover letter, if any) and re-fills; if it was closed, a fresh run starts.
 */
export async function rebaseAutoApply(jobId: string, base: ResumeBase): Promise<void> {
  assertEnabled();
  if (!isResumeBase(base)) throw new Error(`Unknown resume: ${String(base)}`);
  const job = readJob(jobId);
  if (!job) throw new Error("No such auto-apply job");
  if (job.status === "running") throw new Error("Wait for the current step to finish first.");
  if (job.status === "closed") {
    job.forcedBase = base;
    job.status = "running";
    job.error = undefined;
    writeJob(job);
    spawnRunner(jobId);
  } else {
    writeCommand(jobId, "rebase", base);
  }
}

/** The browser window was closed: open it again and re-fill, reusing the tailored documents. */
export async function reopenAutoApply(jobId: string): Promise<void> {
  assertEnabled();
  const job = readJob(jobId);
  if (!job) throw new Error("No such auto-apply job");
  job.status = "running";
  writeJob(job);
  spawnRunner(jobId, true);
}

/**
 * Owen clicked Submit on the real site himself; record it in the application pipeline. The runner
 * never submits, so this is the only place auto-apply marks anything "applied".
 */
export async function markAutoApplySubmitted(jobId: string): Promise<string | null> {
  assertEnabled();
  const job = readJob(jobId);
  if (!job) throw new Error("No such auto-apply job");
  const resume = `Tailored by auto-apply (${job.resumeBase ?? "software"} base, ${job.id})`;

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
