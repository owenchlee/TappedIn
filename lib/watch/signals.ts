import * as cheerio from "cheerio";

/**
 * How far along a site's application cycle looks, from its visible text:
 * - "open": applications/registration are open right now ("Apply now", "Applications are open")
 * - "soon": an announced-but-not-yet-open cycle ("Applications open in mid-October", "save the date")
 * - "none": nothing either way (or it explicitly says closed)
 */
export type WatchLevel = "none" | "soon" | "open";

export type PageScan = { level: WatchLevel; maxYear: number | null; textLength: number };

const CLOSED_RE = /\b(applications?|registrations?)\s+(are\s+|is\s+|have\s+)?(now\s+)?closed\b/i;

// Must be an assertion that it's open *now* — bare "applications open" also appears in
// "we'll email you as soon as applications open" and "our applications open ~2 months before term".
const OPEN_RES = [
  /\b(applications?|registrations?|hacker\s+apps?)\s+(are|is)\s+(now\s+)?open\b(?!\s+(in|on|soon|later|this|next|at|until)\b)/i,
  /\b(applications?|registrations?)\s+(now\s+open|open\s+now|open\s*!)/i,
  /\bapply\s+(now|today|here)\b/i,
  /\bregister\s+(now|today|here)\b/i,
  /\bapplications?\s+(are\s+)?live\b/i,
];

const SOON_RES = [
  /\b(applications?|registrations?)\s+(will\s+)?(open|be\s+released|release|launch)\w*\s+(in|on|soon|later|this|next|at)\b/i,
  /\bsave\s+the\s+date\b/i,
  /\b(as\s+soon\s+as|once|when)\s+(hacker\s+)?applications?\s+(are\s+)?(released|open)\b/i,
  /\bregister\s+your\s+interest\b/i,
  /\bmark\s+your\s+calendars?\b/i,
  /\b(recruiting|recruitment)\s+(for|opens|starts|begins)\b/i,
];

export function extractText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const meta = ["description", "og:description", "og:title", "twitter:description"]
    .map((name) => $(`meta[name="${name}"], meta[property="${name}"]`).attr("content") ?? "")
    .join(" ");
  const text = `${$("title").text()} ${meta} ${$("body").text()}`;
  return text.replace(/\s+/g, " ").trim();
}

export function scanText(text: string, now: Date = new Date()): PageScan {
  const thisYear = now.getUTCFullYear();
  // Only years near the present matter — ignores copyright ranges like "2015–" and far-future noise.
  const years = [...text.matchAll(/\b(20\d{2})\b/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= thisYear - 1 && y <= thisYear + 2);
  const maxYear = years.length ? Math.max(...years) : null;

  let level: WatchLevel = "none";
  if (!CLOSED_RE.test(text)) {
    if (OPEN_RES.some((re) => re.test(text))) level = "open";
    else if (SOON_RES.some((re) => re.test(text))) level = "soon";
  }
  return { level, maxYear, textLength: text.length };
}

const RANK: Record<WatchLevel, number> = { none: 0, soon: 1, open: 2 };

export type PrevWatch = { level: WatchLevel | null; maxYear: number | null };

/**
 * A human-readable alert when a scan shows the cycle moving forward, or null when nothing worth
 * telling you about changed. Only escalations alert — a site going quiet again is not news.
 */
export function signalFor(prev: PrevWatch, scan: PageScan): string | null {
  const firstCheck = prev.level == null;
  const prevRank = firstCheck ? 0 : RANK[prev.level!];

  if (RANK[scan.level] > prevRank) {
    return scan.level === "open"
      ? "Site says applications/registration are open"
      : "Site is announcing an upcoming application cycle";
  }
  // New year on the page = next edition announced. Skipped on first check (no baseline to compare).
  if (!firstCheck && scan.maxYear != null && (prev.maxYear == null || scan.maxYear > prev.maxYear)) {
    return `Site now mentions ${scan.maxYear} — next edition may be announced`;
  }
  return null;
}
