import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PRIVATE_DIR } from "./job";

// How much of Claude's plan the overnight runs may use, so Owen still has Claude during the day.
// `claude -p --output-format stream-json` reports the 5-hour window's use after every call; runClaude
// saves the latest here and the nightly runs check it before each job. Owen's rules (2026-10-09):
//   - No tailoring after noon (Toronto), and none in the evening before 8 PM either.
//   - When the current 5-hour window resets at noon or later, stop at 75% so 25% is left for him.
//   - On a limit hit, wait for the reset only if it comes before noon.

const USAGE_FILE = path.join(PRIVATE_DIR, "nightly", "usage.json");
export const NOON = 12;
const KEEP_FOR_OWEN = 0.25;

export type Usage = { at: string; fiveHour?: { utilization: number; resetsAt: number }; sevenDay?: { utilization: number; resetsAt: number } };

type Window = { utilization?: number; resetsAt?: number };
type RateLimitInfo = { resetsAt?: number; rateLimitType?: string; unifiedWindows?: { five_hour?: Window; seven_day?: Window } };

const win = (w?: Window) => (w && typeof w.utilization === "number" && typeof w.resetsAt === "number" ? { utilization: w.utilization, resetsAt: w.resetsAt } : undefined);

/** Saves a `rate_limit_event`'s numbers from the claude CLI. Never throws. */
export function recordUsage(info: RateLimitInfo) {
  try {
    const fiveHour = win(info.unifiedWindows?.five_hour);
    const sevenDay = win(info.unifiedWindows?.seven_day);
    if (!fiveHour && !sevenDay) return;
    mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    writeFileSync(USAGE_FILE, JSON.stringify({ at: new Date().toISOString(), fiveHour, sevenDay } satisfies Usage, null, 2));
  } catch {}
}

export function readUsage(): Usage | null {
  try {
    return existsSync(USAGE_FILE) ? (JSON.parse(readFileSync(USAGE_FILE, "utf8")) as Usage) : null;
  } catch {
    return null;
  }
}

/** Toronto wall-clock hour (0-23) of a moment. */
export function torontoHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(d));
}

/** The next noon in Toronto at or after `now`, as epoch ms. */
function nextNoon(now: Date): number {
  const ms = 60_000;
  let t = Math.ceil(now.getTime() / ms) * ms;
  while (!(torontoHour(new Date(t)) === NOON && new Date(t).getMinutes() === 0)) t += ms;
  return t;
}

const clock = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });

/** Why the overnight run should stop before starting another job, or null to keep going. */
export function budgetStop(now = new Date()): string | null {
  const h = torontoHour(now);
  if (h >= NOON && h < 20) return "it's past noon, so the rest of the day's Claude use is yours";
  const five = readUsage()?.fiveHour;
  if (!five || five.resetsAt * 1000 <= now.getTime()) return null; // that window is over; a fresh one starts
  if (five.resetsAt * 1000 >= nextNoon(now) && five.utilization >= 1 - KEEP_FOR_OWEN)
    return `${Math.round(five.utilization * 100)}% of Claude's 5-hour limit is used and it resets at ${clock(five.resetsAt)}, so the last 25% is left for you`;
  return null;
}

/** After a limit hit: when to try again (epoch ms), or null when that's not before noon. */
export function retryAt(now = new Date()): number | null {
  const five = readUsage()?.fiveHour;
  const at = five && five.resetsAt * 1000 > now.getTime() ? five.resetsAt * 1000 + 60_000 : now.getTime() + 30 * 60_000;
  return at < nextNoon(now) ? at : null;
}
