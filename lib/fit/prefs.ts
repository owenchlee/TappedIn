import { z } from "zod";
import { JOB_CATEGORIES, type JobCategory } from "@/lib/types";
import { nextTerm, termForDate } from "@/lib/terms";

// What "a good job for you" means. Stored as JSON in the Setting table (key "jobPrefs") so the
// ranking works the same on Vercel as on this laptop; edited on the Settings page. Pure module.

export const PREFS_KEY = "jobPrefs";

export type JobPrefs = {
  /** UW term codes you're looking for, e.g. ["S27"]. */
  targetTerms: string[];
  /** Role types you want, most wanted first. */
  categories: JobCategory[];
  /** Calendar year you graduate. Postings for other graduating classes are hidden. */
  gradYear: number;
  /** Words from your resume that, when a posting asks for them, make it a better fit. */
  skills: string[];
};

// Owen's resumes (private/resume/templates): Languages, Frameworks and Tools lines.
export const DEFAULT_SKILLS = [
  "Python",
  "Java",
  "C++",
  "C",
  "JavaScript",
  "TypeScript",
  "SQL",
  "HTML",
  "CSS",
  "React",
  "Next.js",
  "Node.js",
  "Express",
  "FastAPI",
  "PyTorch",
  "OpenCV",
  "MediaPipe",
  "Git",
  "Supabase",
  "pytest",
];

/** The next Spring/Summer term from today: when most first co-ops and US internships happen. */
export function defaultTargetTerm(now: Date = new Date()): string {
  let t = nextTerm(termForDate(now));
  while (!t.startsWith("S")) t = nextTerm(t);
  return t;
}

export function defaultPrefs(now: Date = new Date()): JobPrefs {
  return { targetTerms: [defaultTargetTerm(now)], categories: ["software", "ai_data", "product", "hardware"], gradYear: 2031, skills: DEFAULT_SKILLS };
}

const schema = z.object({
  targetTerms: z.array(z.string().regex(/^[FWS]\d{2}$/)).max(6),
  categories: z.array(z.enum(JOB_CATEGORIES)).max(JOB_CATEGORIES.length),
  gradYear: z.number().int().min(2020).max(2040),
  skills: z.array(z.string().trim().min(1).max(40)).max(80),
});

export function parsePrefs(json: string | null, now: Date = new Date()): JobPrefs {
  const defaults = defaultPrefs(now);
  if (!json) return defaults;
  try {
    const parsed = schema.partial().safeParse(JSON.parse(json));
    return parsed.success ? { ...defaults, ...parsed.data } : defaults;
  } catch {
    return defaults;
  }
}

export function validatePrefs(input: unknown): JobPrefs | null {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
