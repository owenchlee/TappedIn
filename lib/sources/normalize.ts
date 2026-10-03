import { createHash } from "node:crypto";
import { slugify } from "@/lib/format";
import type { JobCategory, Region } from "@/lib/types";

/** Lowercases the host, drops the hash, and strips all query params (tracking params churn constantly). */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function externalKeyFor(url: string, title: string): string {
  const input = `${normalizeUrl(url)}|${slugify(title)}`;
  return createHash("sha1").update(input).digest("hex");
}

// ---------------------------------------------------------------------------------------------
// Cross-source dedupe keys. Two postings are the same job if EITHER key matches:
//  - urlKey: the application URL, minus scheme/www/query/trailing "/apply" noise
//  - titleKey: company + role, normalized so "Co-op"/"Internship"/"Intern" and punctuation agree
// ---------------------------------------------------------------------------------------------

export function urlKeyFor(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname
      .toLowerCase()
      .replace(/\/(apply|application|applications)\/?$/, "")
      .replace(/\/+$/, "");
    // A bare careers homepage identifies a company, not a job — never dedupe on it.
    if (path === "" || /^\/(careers?|jobs?)$/.test(path)) return null;
    return `${host}${path}`;
  } catch {
    return null;
  }
}

const COMPANY_SUFFIX_RE =
  /\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|plc|gmbh|sa|ag|technologies|technology|labs|group|holdings)\b\.?/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(COMPANY_SUFFIX_RE, " ")
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bco-?op\b|\binternship\b|\bintern\b|\bstudent\b/g, "intern")
    .replace(/\b(sr|senior)\b/g, "senior")
    .replace(/\s*[-–—|]\s*(remote|hybrid|onsite|on-site)\b.*$/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function titleKeyFor(company: string, title: string): string {
  return `${normalizeCompany(company)}|${normalizeTitle(title)}`;
}

// ---------------------------------------------------------------------------------------------
// Region + category inference from free-text locations and titles.
// ---------------------------------------------------------------------------------------------

const CA_PROVINCES = "ON|BC|QC|AB|MB|SK|NS|NB|NL|PE|PEI|YT|NT|NU";
const CA_RE = new RegExp(
  `\\bcanada\\b|,\\s*(${CA_PROVINCES})\\b|\\b(ontario|british columbia|quebec|québec|alberta|manitoba|saskatchewan|nova scotia|new brunswick)\\b|\\b(toronto|waterloo|kitchener|ottawa|montreal|montréal|vancouver|calgary|edmonton|mississauga|markham|burnaby|halifax|winnipeg|guelph|hamilton|london, on|oakville|victoria, bc)\\b`,
  "i",
);
const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_RE = new RegExp(
  `,\\s*(${US_STATES})\\b|\\b(united states|usa|u\\.s\\.)\\b|\\b(new york|san francisco|seattle|boston|chicago|austin|los angeles|palo alto|mountain view|menlo park|sunnyvale|san jose|bay area|nyc)\\b`,
  "i",
);
// Simplify writes many US locations as bare abbreviations ("SF", "LA", "South SF") or state names.
// Case-sensitive on purpose: "la"/"sf" inside other words or lowercase text must not match.
const US_ABBREV_RE = /\b(SF|LA|NYC|DC|SoCal|NorCal)\b/;
const US_STATE_NAMES_RE =
  /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;
// "City, ST" with a US state code is unambiguous, so it beats Canadian city names ("Hamilton, NJ",
// "New Brunswick, NJ", "London, KY").
const US_STATE_CODE_RE = new RegExp(`,\\s*(${US_STATES})\\b`);
const CA_PROVINCE_CODE_RE = new RegExp(`,\\s*(${CA_PROVINCES})\\b`);
const REMOTE_RE = /\bremote\b|\banywhere\b|\bwork from home\b/i;

function isUs(location: string): boolean {
  return US_RE.test(location) || US_ABBREV_RE.test(location) || US_STATE_NAMES_RE.test(location);
}

export function regionForLocation(location: string | null | undefined): Region | null {
  if (!location) return null;
  // One posting can list several locations; Canada wins, then remote, then US.
  const explicitCanada = /\bcanada\b/i.test(location) || CA_PROVINCE_CODE_RE.test(location);
  if (explicitCanada) return "canada";
  if (REMOTE_RE.test(location)) {
    // "Remote in USA" is still a US job for someone who needs Canadian work eligibility.
    if (isUs(location)) return "us";
    return "remote";
  }
  if (US_STATE_CODE_RE.test(location)) return "us";
  if (CA_RE.test(location)) return "canada";
  if (isUs(location)) return "us";
  return "intl";
}

export function regionForLocations(locations: string[]): Region | null {
  const regions = locations.map(regionForLocation).filter((r): r is Region => r != null);
  for (const r of ["canada", "remote", "us", "intl"] as const) {
    if (regions.includes(r)) return r;
  }
  return null;
}

export function categoryFromLabel(label: string | null | undefined): JobCategory | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l.includes("quant")) return "quant";
  if (l.includes("hardware")) return "hardware";
  if (l.includes("ai") || l.includes("data") || l.includes("machine learning")) return "ai_data";
  if (l.includes("product")) return "product";
  if (l.includes("software")) return "software";
  return "other";
}

export function categoryFromTitle(title: string): JobCategory {
  const t = title.toLowerCase();
  if (/\bquant|trading|trader\b/.test(t)) return "quant";
  if (/\b(hardware|asic|fpga|pcb|pcba|electrical|embedded|firmware|verification|silicon|analog|rf|mechanical|robotics)\b/.test(t))
    return "hardware";
  if (/\b(machine learning|ml|ai|data|analytics|research scientist)\b/.test(t)) return "ai_data";
  if (/\bproduct manage|\bpm\b|product management/.test(t)) return "product";
  if (/\b(software|developer|engineer|swe|full[- ]?stack|backend|back end|frontend|front end|devops|sre|web|mobile|ios|android|security)\b/.test(t))
    return "software";
  return "other";
}

/** Titles that are clearly student roles — used to filter company boards that also list full-time jobs. */
export const STUDENT_TITLE_RE = /\b(intern|internship|co-?op|student|new grad|university grad|graduate program|early career)\b/i;
