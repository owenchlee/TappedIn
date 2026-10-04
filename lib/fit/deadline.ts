import { dateInputToStorage } from "@/lib/deadline";

// Application deadlines written in the posting text ("Application Deadline: October 17, 2026",
// "Deadline to Apply: 10/15/26", RBC's "Application Deadline:\n\n2026-10-09"). The feeds almost
// never carry one: 1 of 4,110 readable postings had a deadline before this. Pure.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

// (?<![a-z]) rather than \b: RBC's text runs labels into the date before them ("2026-09-23Application").
const LABEL =
  /(?<![a-z])(application deadline|deadline to (?:apply|submit)[^:\n]{0,30}|(?:the )?deadline to apply is|apply by|applications? (?:will )?close[sd]?(?: on)?|application close|application window[^.\n]{0,50}?close[sd]? on|(?:job )?posting (?:will )?(?:close[sd]?|end date)(?: on)?|closing date(?: \(mm\/dd\/yyyy\))?|(?:anticipated|expected) to close on|will close on|open until)\b/gi;
// Between the label and the date: the posting says there is no real deadline.
const NOT_A_DEADLINE = /\b(no (?:fixed )?(?:application )?deadline|ongoing basis|until (?:the )?(?:position|role)s? (?:is |are )?filled|at least|rolling)\b/i;

const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpExecArray) => { y?: number; m: number; d: number }[] }[] = [
  {
    // October 31, 2026 / Friday, November 13th, 2026 / October 17
    re: new RegExp(`\\b${MON}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?:,? (20\\d\\d))?\\b`, "i"),
    parse: (m) => [{ m: MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), d: Number(m[2]), y: m[3] ? Number(m[3]) : undefined }],
  },
  {
    // 30th October / 16 Oct 2026
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? ${MON}\\.?,?(?: (20\\d\\d))?\\b`, "i"),
    parse: (m) => [{ m: MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), d: Number(m[1]), y: m[3] ? Number(m[3]) : undefined }],
  },
  {
    // 2026-10-09
    // RBC runs the next label straight on: "2026-10-05Note:".
    re: /\b(20\d\d)-(\d{2})-(\d{2})(?!\d)/,
    parse: (m) => [{ y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) }],
  },
  {
    // 10/15/26, 8/13/2027, 23/10/2026: month/day first unless that can't be right.
    re: /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/,
    parse: (m) => {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const a = Number(m[1]);
      const b = Number(m[2]);
      return [
        { y, m: a - 1, d: b },
        { y, m: b - 1, d: a },
      ];
    },
  },
];

function valid(y: number, m: number, d: number): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m, d, 12));
  return date.getUTCMonth() === m ? date : null;
}

const DAY = 86_400_000;

/**
 * The application deadline the posting states, as a UTC-noon date (the app's deadline convention),
 * or null. Only dates from 2 days before `postedAt` to 400 days after count; a missing year is the
 * first one that fits. "Accepted until 11:59 PM on the day prior" moves it a day earlier.
 */
export function extractDeadline(text: string, postedAt: Date): Date | null {
  const lo = postedAt.getTime() - 2 * DAY;
  const hi = postedAt.getTime() + 400 * DAY;
  const fits = (dt: Date | null) => dt != null && dt.getTime() >= lo && dt.getTime() <= hi;

  for (const label of text.matchAll(LABEL)) {
    const start = (label.index ?? 0) + label[0].length;
    const window = text.slice(start, start + 90);
    let best: { at: number; date: Date } | null = null;
    for (const { re, parse } of DATE_PATTERNS) {
      const m = re.exec(window);
      if (!m || (best && m.index >= best.at)) continue;
      if (NOT_A_DEADLINE.test(window.slice(0, m.index))) continue;
      for (const c of parse(m)) {
        const years = c.y != null ? [c.y] : [postedAt.getUTCFullYear(), postedAt.getUTCFullYear() + 1];
        const date = years.map((y) => valid(y, c.m, c.d)).find(fits);
        if (date) {
          best = { at: m.index, date };
          break;
        }
      }
    }
    if (!best) continue;
    const after = text.slice(start, start + 260);
    const dayBefore = /\b(day prior|day before)\b/i.test(after);
    const date = dayBefore ? new Date(best.date.getTime() - DAY) : best.date;
    return dateInputToStorage(date.toISOString().slice(0, 10));
  }
  return null;
}
