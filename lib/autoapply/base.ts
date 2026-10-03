// Which of Owen's three Overleaf resumes a tailored resume starts from. Each maps to
// private/resume/templates/<base>.tex. Pure module: shared by the runner and the app.

export const RESUME_BASES = ["software", "hardware", "pm"] as const;
export type ResumeBase = (typeof RESUME_BASES)[number];

export const RESUME_BASE_LABELS: Record<ResumeBase, string> = {
  software: "Software",
  hardware: "Hardware",
  pm: "Product management",
};

/** Badge colours, so each base is recognisable at a glance in the runs list and status page. */
export const BASE_BADGE: Record<ResumeBase, "sky" | "violet" | "rose"> = { software: "sky", hardware: "violet", pm: "rose" };

export function isResumeBase(v: unknown): v is ResumeBase {
  return typeof v === "string" && (RESUME_BASES as readonly string[]).includes(v);
}

// Product first: "Hardware Product Manager" is a PM role, "Software Engineer, Product" is not.
const PM_TITLE =
  /\b(product (manager|management|owner|analyst|operations|lead|strategy)|apm|associate product|program manag|project (manager|coordinator|management)|technical program)/i;
const HARDWARE_TITLE =
  /\b(hardware|asic|fpga|pcb|pcba|electrical|electronics|embedded|firmware|silicon|analog|rf|robotics|mechatronics)\b/i;
const SOFTWARE_TITLE =
  /\b(software|developer|engineer|engineering|swe|full[- ]?stack|back[- ]?end|front[- ]?end|devops|sre|web|mobile|ios|android|data|machine learning|ml|ai)\b/i;

/**
 * A deterministic second opinion from the job title alone, used to double-check Claude's pick.
 * Returns null when the title doesn't clearly point anywhere (e.g. "Co-op Student").
 */
export function baseFromTitle(role: string): ResumeBase | null {
  if (PM_TITLE.test(role)) return "pm";
  if (HARDWARE_TITLE.test(role)) return "hardware";
  if (SOFTWARE_TITLE.test(role)) return "software";
  return null;
}

/** Reads the "Base: <x>" line Claude writes at the top of notes.md. */
export function parseBaseLine(notes: string): ResumeBase | null {
  const m = /^Base:\s*(software|hardware|pm)\b/im.exec(notes);
  return m ? (m[1].toLowerCase() as ResumeBase) : null;
}

/** Reads the one-sentence "Why: ..." line that follows it. */
export function parseWhyLine(notes: string): string | undefined {
  return /^Why:\s*(.+)$/im.exec(notes)?.[1].trim() || undefined;
}
