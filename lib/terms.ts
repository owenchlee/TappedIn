/**
 * UW-style term codes: "F26" (Sep–Dec 2026), "W27" (Jan–Apr 2027), "S27" (May–Aug 2027).
 *
 * US-centric listings say "Summer" for May–Aug (UW's Spring term) and "Spring" for Jan–May
 * internships, which line up with UW's Winter term — so both get mapped onto UW's calendar.
 */
export type Season = "F" | "W" | "S";

const SEASON_ORDER: Record<Season, number> = { W: 0, S: 1, F: 2 };
const SEASON_NAMES: Record<Season, string> = { F: "Fall", W: "Winter", S: "Spring" };

export function termCode(season: Season, year: number): string {
  return `${season}${String(year % 100).padStart(2, "0")}`;
}

export function parseTermCode(code: string): { season: Season; year: number } | null {
  const m = /^([FWS])(\d{2})$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  return { season: m[1] as Season, year: 2000 + Number(m[2]) };
}

/** Sortable number: 2027 Winter < 2027 Spring < 2027 Fall. */
export function termSortKey(code: string): number {
  const t = parseTermCode(code);
  return t ? t.year * 10 + SEASON_ORDER[t.season] : 0;
}

export function termLabel(code: string): string {
  const t = parseTermCode(code);
  return t ? `${SEASON_NAMES[t.season]} ${t.year}` : code;
}

export function termShortLabel(code: string): string {
  const t = parseTermCode(code);
  return t ? `${SEASON_NAMES[t.season]} '${String(t.year % 100).padStart(2, "0")}` : code;
}

export function termForDate(date: Date): string {
  const month = date.getUTCMonth(); // 0-based
  const year = date.getUTCFullYear();
  if (month <= 3) return termCode("W", year);
  if (month <= 7) return termCode("S", year);
  return termCode("F", year);
}

export function nextTerm(code: string): string {
  const t = parseTermCode(code);
  if (!t) return code;
  if (t.season === "W") return termCode("S", t.year);
  if (t.season === "S") return termCode("F", t.year);
  return termCode("W", t.year + 1);
}

/** The next `count` terms starting at `from` (inclusive). */
export function termRange(from: string, count: number): string[] {
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = nextTerm(cur);
  }
  return out;
}

/** Map a free-text season + year ("Summer 2027", "Fall 2026", "Spring 2027") to a UW term code. */
export function termFromSeasonYear(season: string, year: number): string | null {
  const s = season.toLowerCase();
  if (s.startsWith("fall") || s.startsWith("autumn")) return termCode("F", year);
  if (s.startsWith("winter")) return termCode("W", year);
  // US "Spring" internships run Jan–May, which is UW's Winter term.
  if (s.startsWith("spring")) return termCode("W", year);
  if (s.startsWith("summer")) return termCode("S", year);
  return null;
}

const SEASON_YEAR_RE = /\b(fall|autumn|winter|spring|summer)[\s/,-]*(?:term\s*)?(20\d{2})\b/gi;
const MONTH_YEAR_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,-]*(20\d{2})\b/gi;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Pull term codes out of a posting title, e.g. "SWE Intern (Winter 2027)" → ["W27"]. */
export function termsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(SEASON_YEAR_RE)) {
    const code = termFromSeasonYear(m[1], Number(m[2]));
    if (code) found.add(code);
  }
  if (found.size === 0) {
    // "Co-op (January 2027 - 4 months)" style: the start month decides the term.
    for (const m of text.matchAll(MONTH_YEAR_RE)) {
      const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
      if (month < 0) continue;
      found.add(termForDate(new Date(Date.UTC(Number(m[2]), month, 15))));
      break;
    }
  }
  return [...found].sort((a, b) => termSortKey(a) - termSortKey(b));
}
