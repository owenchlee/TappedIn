import type { Urgency } from "@/lib/types";

const TZ = "America/Toronto";

const calendarFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  day: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "YYYY-MM-DD" for the given instant, as seen in America/Toronto. */
function toCalendarDateString(date: Date): string {
  return calendarFormatter.format(date);
}

function calendarDateStringToUtcMidnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Toronto calendar year, not the runtime's local year — matters near a New Year boundary when the
 * server/browser timezone differs from America/Toronto. */
function calendarYear(date: Date): number {
  return Number(toCalendarDateString(date).slice(0, 4));
}

/** Whole calendar-day difference (deadline - now) in America/Toronto, DST-safe. */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  const deadlineMs = calendarDateStringToUtcMidnightMs(toCalendarDateString(deadline));
  const nowMs = calendarDateStringToUtcMidnightMs(toCalendarDateString(now));
  return Math.round((deadlineMs - nowMs) / 86_400_000);
}

export function urgencyOf(deadline: Date | null | undefined, now: Date = new Date()): Urgency {
  if (!deadline) return "none";
  const days = daysUntil(deadline, now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "far";
}

/** True for urgencies that should visually stand out on a card (due within 7 days, or overdue). */
export function isStandoutUrgency(urgency: Urgency): boolean {
  return urgency === "overdue" || urgency === "today" || urgency === "urgent";
}

export function deadlineLabel(deadline: Date, now: Date = new Date()): string {
  const days = daysUntil(deadline, now);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "Overdue by 1 day";
  if (days < -1) return `Overdue by ${-days} days`;
  if (days <= 30) return `Due in ${days} days`;
  const formatter = calendarYear(deadline) === calendarYear(now) ? shortDateFormatter : longDateFormatter;
  return `Due ${formatter.format(deadline)}`;
}

export function formatDate(date: Date, now: Date = new Date()): string {
  const formatter = calendarYear(date) === calendarYear(now) ? shortDateFormatter : longDateFormatter;
  return formatter.format(date);
}

/** Parse a `<input type="date">` value ("YYYY-MM-DD") into a UTC-noon Date for storage. */
export function dateInputToStorage(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Inverse of dateInputToStorage — safe because 12:00 UTC never crosses a Toronto midnight boundary. */
export function storageToDateInput(date: Date): string {
  return toCalendarDateString(date);
}

/** True once the given date's Toronto calendar day is over — a deadline of today is still live. */
export function isPastDate(date: Date | null | undefined, now: Date = new Date()): boolean {
  return date != null && daysUntil(date, now) < 0;
}
