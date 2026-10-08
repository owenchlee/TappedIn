import os from "node:os";
import path from "node:path";
import { termSortKey } from "@/lib/terms";
import type { Job } from "./job";

// The morning queue: what the nightly batch (scripts/nightly.ts) tailored and Owen hasn't applied to
// or skipped yet, plus the rules the batch picks jobs by. Pure, so the picker and the queue page
// agree on what "still waiting" means.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Within a night's batch, jobs closing within this window go first. */
export const CLOSING_SOON_MS = 72 * HOUR;
/** A night's batch stays in the queue this many days (today's, yesterday's, the day before's). */
export const QUEUE_DAYS = 3;

/** Midnight in Toronto at the start of a batch date ("2026-10-05"). */
function batchStart(batch: string): number {
  return Date.parse(`${batch}T00:00:00-04:00`);
}

/**
 * Tailored by a nightly batch in the last few days (or pinned), documents ready, not yet applied to
 * or skipped, deadline not passed. Older ones drop off so the queue stays fresh; they stay in Resumes.
 */
export function isQueued(job: Job, now = new Date()): boolean {
  if (!job.batch || job.submittedAt || job.skippedAt || job.status !== "ready") return false;
  if (!job.pinned && !job.keep && now.getTime() - batchStart(job.batch) >= QUEUE_DAYS * DAY) return false;
  return !job.deadline || Date.parse(job.deadline) > now.getTime() - 12 * HOUR;
}

/**
 * Pinned first, then batch by batch, oldest first: each night's jobs join the end, so the job at the
 * front never changes under you. Within a batch: closing within three days (soonest first), then best fit.
 */
export function queueOrder(jobs: Job[], now = new Date()): Job[] {
  const soon = (j: Job) => (j.deadline && Date.parse(j.deadline) - now.getTime() < CLOSING_SOON_MS ? Date.parse(j.deadline) : Infinity);
  return jobs
    .filter((j) => isQueued(j, now))
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (a.batch ?? "").localeCompare(b.batch ?? "") ||
        soon(a) - soon(b) ||
        (b.fitScore ?? 0) - (a.fitScore ?? 0) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** Roles a first-year without work experience realistically won't get: senior, research, grad-level. */
export function unrealisticTitle(role: string): boolean {
  return /\b(senior|sr\.?|staff|principal|lead|manager|director|phd|ph\.d|masters?|master's|mba|graduate|new grad|research(er)?|scientist|postdoc(toral)?)\b/i.test(role);
}

/**
 * Whether a posting is for one of Owen's target terms (Summer 2027). One that never says its term
 * counts (most are summer). One that names only other terms doesn't, including when its own text
 * disagrees with the list's tag (lists sometimes tag a "Co-op (Jan 2027)" as Summer). A multi-term
 * placement ("8 month") must start in the target term, not run into it from an earlier one.
 */
export function inTargetTerm(terms: string[], title: string, targets: string[], textTerms: string[] = []): boolean {
  // Most postings that never say their term are summer ones, so silence counts as a yes.
  if (terms.length > 0 && !terms.some((t) => targets.includes(t))) return false;
  if (textTerms.length > 0 && !textTerms.some((t) => targets.includes(t))) return false;
  const multi = terms.length > 1 && /\b(8|12|16)[\s-]*months?\b/i.test(title);
  return !multi || targets.includes([...terms].sort((a, b) => termSortKey(a) - termSortKey(b))[0]);
}

/** Whether a remote posting's text says Canadians can take it. */
export function mentionsCanada(text: string): boolean {
  return /\bcanad(a|ian)\b|\b(ontario|toronto|waterloo|vancouver|montr[eé]al|ottawa|calgary|british columbia|qu[eé]bec)\b/i.test(text);
}

// Household-name employers whose internships draw thousands of applicants each: big tech, big chips,
// hot AI startups, top quant firms and the big Canadian banks. A first-year's odds there are tiny,
// so the nightly batch ranks them last and takes only a few a night (Owen's call, 2026-10-08).
const BIG_NAMES = [
  "amazon", "aws", "google", "alphabet", "deepmind", "meta", "apple", "microsoft", "netflix", "nvidia", "amd",
  "intel", "qualcomm", "tesla", "spacex", "xai", "openai", "anthropic", "figma", "stripe", "databricks",
  "bytedance", "tiktok", "uber", "airbnb", "salesforce", "adobe", "autodesk", "atlassian", "shopify", "ibm",
  "oracle", "cisco", "intuit", "electronic arts", "linkedin", "snowflake", "palantir", "jane street",
  "citadel", "two sigma", "hudson river trading", "jump trading", "optiver", "royal bank of canada", "rbc",
  "td", "bmo", "scotiabank", "cibc", "marvell", "cadence", "synopsys", "broadcom", "samsung", "harvey",
  "superhuman", "robinhood", "coinbase", "pinterest", "snap", "doordash", "lyft", "wealthsimple", "ramp",
  "notion", "scale ai", "perplexity", "cohere", "bloomberg", "goldman sachs", "morgan stanley", "jpmorgan",
  "waymo", "capital one", "affirm", "expedia", "dropbox", "reddit", "spotify", "datadog", "cloudflare",
  "roblox", "discord", "duolingo", "paypal", "ebay", "palo alto networks", "servicenow", "workday",
];
const BIG_RE = new RegExp(`^(${BIG_NAMES.map((n) => n.replace(/ /g, "\\s+")).join("|")})\\b`, "i");

/** A household-name company whose internships are swamped with applicants. */
export function bigCompany(company: string): boolean {
  return BIG_RE.test(company.trim());
}

/**
 * How good a nightly pick is for Owen: the fit score, plus extra weight on what makes a job
 * realistic for a first-year (open to early students, co-op, not a household name) and on how
 * recently it was posted.
 */
export function realismScore(
  r: { company?: string; fitScore: number | null; fitReasons: string[]; postedAt: Date | null; firstSeenAt: Date },
  now = new Date(),
): number {
  const posted = r.postedAt && r.postedAt < r.firstSeenAt ? r.postedAt : r.firstSeenAt;
  const age = (now.getTime() - posted.getTime()) / DAY;
  let s = r.fitScore ?? 0;
  if (r.fitReasons.includes("+Open to 1st/2nd years")) s += 15;
  if (r.fitReasons.includes("+Co-op friendly")) s += 8;
  if (age <= 2) s += 12;
  else if (age <= 7) s += 6;
  if (r.company && bigCompany(r.company)) s -= 25;
  return s;
}

/**
 * Pick in order until `count` are chosen: at most `perCompany` from one company, at most `maxBig`
 * from household-name companies, and one of each title (the same role posted for several cities is
 * one application's worth of tailoring).
 */
export function spreadPicks<T extends { company: string; role: string }>(rows: T[], count: number, perCompany = 2, maxBig = Infinity): T[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const perCo = new Map<string, number>();
  const titles = new Set<string>();
  const out: T[] = [];
  let big = 0;
  for (const r of rows) {
    if (out.length >= count) break;
    const co = norm(r.company);
    const title = `${co}|${norm(r.role)}`;
    const n = perCo.get(co) ?? 0;
    if (n >= perCompany || titles.has(title)) continue;
    if (bigCompany(r.company)) {
      if (big >= maxBig) continue;
      big++;
    }
    perCo.set(co, n + 1);
    titles.add(title);
    out.push(r);
  }
  return out;
}

/**
 * A one-page PDF naming the job, for the "FOR <company> - <role>.pdf" label in Apply Today: a PDF so
 * it still shows when an upload box only lists PDFs, and a real one so it opens if clicked.
 */
export function labelPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/([\\()])/g, "\\$1");
  // Word-wrap to the page: about 48 characters a line at 18pt, 72 at 12pt.
  const wrap = (s: string, max: number) =>
    s.split(" ").reduce<string[]>((out, w) => {
      if (out.length && (out.at(-1) + " " + w).length <= max) out[out.length - 1] += " " + w;
      else out.push(w);
      return out;
    }, []);
  let y = 720;
  const text = lines
    .flatMap((l, i) => {
      const size = i === 0 ? 18 : 12;
      if (i > 0) y -= 10;
      return wrap(esc(l), i === 0 ? 48 : 72).map((part) => `BT /F1 ${size} Tf 72 ${(y -= size + 6) + size + 6} Td (${part}) Tj ET`);
    })
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = Buffer.byteLength(out, "latin1");
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Documents\Apply Today: holds the current queue job's PDFs, so file pickers always open on them. */
export function applyFolder(): string {
  return path.join(os.homedir(), "Documents", "Apply Today");
}
