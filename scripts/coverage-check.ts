/**
 * Coverage check: does TappedIn have every good Summer 2027 role from SimplifyJobs?
 *   npm run coverage:check            (pipeline only: what a refresh would store)
 *   npm run coverage:check -- --db    (also compares against the database after a refresh)
 *
 * Pulls the live SimplifyJobs feed, keeps active + visible Summer 2027 rows in the categories Owen
 * applies to, runs the real source pipeline (adapter → enrich → match) on the same feed, and reports
 * per category: feed count, kept count, rows dropped on purpose (outside Canada/US/remote), and rows
 * missing for no good reason. Missing should be 0.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { simplifyAdapter } from "../lib/sources/adapters/simplify";
import { enrich } from "../lib/sources/enrich";
import { applyMatch } from "../lib/sources/filter";
import { urlKeyFor } from "../lib/sources/normalize";
import type { FetchCtx, LoadedSource, SourceMatch } from "../lib/sources/types";

const FEED = "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";
const TERM = "Summer 2027";
const CATEGORIES: Record<string, string> = {
  Software: "SWE",
  "Software Engineering": "SWE",
  "AI/ML/Data": "AI-ML",
  Product: "PM",
};

type Listing = {
  id: string;
  company_name: string;
  title: string;
  url: string;
  locations?: string[];
  active?: boolean;
  is_visible?: boolean;
  terms?: string[];
  category?: string;
};

const ua = process.env.FETCH_USER_AGENT || "TappedIn/1.0 (personal job tracker)";
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": ua } });
  if (!res.ok) throw Object.assign(new Error(`${res.status} for ${url}`), { status: res.status });
  return (await res.json()) as T;
}

// Only the feed above is served; the adapter's {year} expansion also asks for next year's list.
const ctx: FetchCtx = {
  async fetchJson<T>(url: string) {
    if (url !== FEED) {
      const { SourceFetchError } = await import("../lib/sources/types");
      throw new SourceFetchError(`not part of this check: ${url}`, 404);
    }
    return getJson<T>(url);
  },
  fetchText: () => Promise.reject(new Error("unused")),
  postJson: () => Promise.reject(new Error("unused")),
};

const rowKey = (url: string, title: string) => `${urlKeyFor(url) ?? url}|${title.trim().toLowerCase()}`;

async function main() {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "data", "company-sources.json"), "utf8")) as {
    sources: { key: string; name: string; careerUrl: string; adapter: string; enabled: boolean; config: Record<string, unknown>; match?: SourceMatch }[];
  };
  const src = config.sources.find((s) => s.key === "simplify-internships");
  if (!src) throw new Error("simplify-internships is missing from data/company-sources.json");
  if (!src.enabled) console.warn("WARNING: simplify-internships is disabled in data/company-sources.json");

  const feed = await getJson<Listing[]>(FEED);
  const wanted = feed.filter(
    (l) => l.active === true && l.is_visible !== false && (l.terms ?? []).includes(TERM) && l.category != null && l.category in CATEGORIES,
  );

  const loaded: LoadedSource = { ...src, adapter: "simplify", config: { ...src.config, url: FEED } } as LoadedSource;
  const raw = await simplifyAdapter.fetch(loaded, ctx);
  const enriched = raw.map(enrich);
  const kept = new Set(applyMatch(enriched, src.match).map((p) => rowKey(p.url, p.title)));
  const fetched = new Map(enriched.map((p) => [rowKey(p.url, p.title), p]));

  let dbKeys: Set<string> | null = null;
  if (process.argv.includes("--db")) {
    const { prisma } = await import("../lib/db");
    // Visible on the Jobs page = open, and either its own row or merged into an open copy of the
    // same job from another list (duplicateOf).
    const rows = await prisma.coopPosting.findMany({
      where: { sourceKey: src.key },
      select: { url: true, role: true, status: true, duplicateOf: { select: { status: true, duplicateOfId: true } } },
    });
    const visible = (r: (typeof rows)[number]) =>
      r.duplicateOf ? r.duplicateOf.status !== "closed" && r.duplicateOf.duplicateOfId == null : r.status !== "closed";
    dbKeys = new Set(rows.filter(visible).map((r) => rowKey(r.url, r.role)));
    await prisma.$disconnect();
  }

  const report: Record<string, { feed: number; kept: number; outOfRegion: number; missing: Listing[]; notInDb: Listing[] }> = {};
  for (const l of wanted) {
    const cat = CATEGORIES[l.category!];
    const r = (report[cat] ??= { feed: 0, kept: 0, outOfRegion: 0, missing: [], notInDb: [] });
    r.feed++;
    const key = rowKey(l.url, l.title);
    if (kept.has(key)) {
      r.kept++;
      if (dbKeys && !dbKeys.has(key)) r.notInDb.push(l);
    } else if (fetched.get(key)?.region === "intl") r.outOfRegion++;
    else r.missing.push(l);
  }

  let bad = 0;
  for (const [cat, r] of Object.entries(report)) {
    const pct = ((100 * r.kept) / Math.max(1, r.feed - r.outOfRegion)).toFixed(1);
    console.log(
      `\n${cat}: feed ${r.feed} | kept ${r.kept} (${pct}% of in-region) | outside Canada/US/remote ${r.outOfRegion} | missing ${r.missing.length}` +
        (dbKeys ? ` | kept but not visible in DB ${r.notInDb.length}` : ""),
    );
    for (const l of r.missing.slice(0, 20)) {
      const p = fetched.get(rowKey(l.url, l.title));
      console.log(`  MISSING ${l.company_name} | ${l.title} | ${(l.locations ?? []).join(" / ")} | region=${p?.region ?? "none"} | ${l.url}`);
    }
    for (const l of r.notInDb.slice(0, 20)) console.log(`  NOT VISIBLE ${l.company_name} | ${l.title} | ${l.url}`);
    bad += r.missing.length + r.notInDb.length;
  }
  console.log(`\nTotal ${wanted.length} Summer 2027 SWE/AI-ML/PM rows in the feed; ${bad} missing.`);
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
