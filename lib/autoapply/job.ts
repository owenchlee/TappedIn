import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ResumeBase } from "./base";

// Shared between the Next.js app and the detached runner (scripts/autoapply.ts), so this module
// must stay free of Next and Prisma imports. The runner owns job.json once it starts; the app only
// creates it and afterwards talks to the runner through command.json.

export const PRIVATE_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "private");
export const APPLICATIONS_DIR = path.join(PRIVATE_DIR, "applications");

export const STEP_NAMES = ["open", "tailor", "cover_letter", "fill"] as const;
export type StepName = (typeof STEP_NAMES)[number];
export type StepState = "pending" | "running" | "done" | "skipped" | "failed";

export type JobStatus = "running" | "ready" | "failed" | "closed";

export type FieldReport = { label: string; filled: boolean; value?: string; reason?: string; required: boolean };

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: { kind: "coop" | "org"; id: string };
  company: string;
  role: string;
  url: string;
  status: JobStatus;
  steps: Record<StepName, { state: StepState; detail?: string }>;
  resumeBase?: ResumeBase;
  /** Claude's one-sentence reason for the pick (or "You chose this resume"). */
  baseReason?: string;
  /** Independent check from the job title; null when the title is too vague to judge. */
  baseCheck?: { titleSuggests: ResumeBase | null; agrees: boolean };
  /** Set when Owen overrides the pick; the next tailor run must use it. */
  forcedBase?: ResumeBase;
  coverLetter?: { needed: boolean; reason: string; humanized?: boolean };
  tailorNotes?: string;
  fields?: FieldReport[];
  error?: string;
  /** Set when Owen confirms he clicked Submit on the real site (the runner never submits). */
  submittedAt?: string;
  applicationId?: string;
  log: { at: string; msg: string }[];
};

export type JobCommand = { command: "refill" | "cover" | "close" | "rebase"; at: string; base?: ResumeBase };

const ID_RE = /^[a-z0-9-]{8,80}$/;

export function isValidJobId(id: string): boolean {
  return ID_RE.test(id);
}

export function jobDir(id: string): string {
  if (!isValidJobId(id)) throw new Error(`Invalid job id: ${id}`);
  return path.join(APPLICATIONS_DIR, id);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function newJobId(company: string, role: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${slug(`${company}-${role}`) || "job"}`;
}

export function createJob(input: Pick<Job, "source" | "company" | "role" | "url">): Job {
  const now = new Date();
  const job: Job = {
    id: newJobId(input.company, input.role, now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...input,
    status: "running",
    steps: { open: { state: "pending" }, tailor: { state: "pending" }, cover_letter: { state: "pending" }, fill: { state: "pending" } },
    log: [],
  };
  mkdirSync(jobDir(job.id), { recursive: true });
  writeJob(job);
  return job;
}

/** Atomic write (temp file + rename) so the app's poller never reads a half-written job.json. */
export function writeJob(job: Job): void {
  job.updatedAt = new Date().toISOString();
  const file = path.join(jobDir(job.id), "job.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(job, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function readJob(id: string): Job | null {
  if (!isValidJobId(id)) return null;
  const file = path.join(jobDir(id), "job.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Job;
  } catch {
    return null;
  }
}

export function listJobs(): Job[] {
  if (!existsSync(APPLICATIONS_DIR)) return [];
  return readdirSync(APPLICATIONS_DIR)
    .filter(isValidJobId)
    .map(readJob)
    .filter((j): j is Job => j != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function writeCommand(id: string, command: JobCommand["command"], base?: ResumeBase): void {
  const file = path.join(jobDir(id), "command.json");
  writeFileSync(`${file}.tmp`, JSON.stringify({ command, at: new Date().toISOString(), base } satisfies JobCommand));
  renameSync(`${file}.tmp`, file);
}

/** Files the UI may serve for a job. Anything else in the job dir (prompts, logs) stays private. */
export const SERVABLE_FILES = {
  "resume.pdf": "application/pdf",
  "resume.tex": "text/plain; charset=utf-8",
  "cover-letter.pdf": "application/pdf",
  "cover-letter.txt": "text/plain; charset=utf-8",
} as const;
export type ServableFile = keyof typeof SERVABLE_FILES;
