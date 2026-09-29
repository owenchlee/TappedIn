import { categoryFromLabel, regionForLocations } from "@/lib/sources/normalize";
import { termFromSeasonYear, termsFromText } from "@/lib/terms";
import { fetchAllYears } from "@/lib/sources/yearUrls";
import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

/** Shape of `.github/scripts/listings.json` in the SimplifyJobs / vanshb03 internship repos. */
type Listing = {
  company_name: string;
  title: string;
  url: string;
  locations?: string[];
  active?: boolean;
  is_visible?: boolean;
  terms?: string[]; // SimplifyJobs: ["Summer 2027", "Fall 2026"]
  season?: string | null; // vanshb03: "Winter"
  category?: string;
  date_posted?: number; // unix seconds
};

function termsFor(listing: Listing, fallbackYear: number | null): string[] {
  const out = new Set<string>();
  for (const raw of listing.terms ?? []) {
    const m = /^(\w+)\s+(20\d{2})$/.exec(raw.trim());
    const code = m ? termFromSeasonYear(m[1], Number(m[2])) : null;
    if (code) out.add(code);
  }
  if (out.size === 0 && listing.season && fallbackYear) {
    for (const part of listing.season.split("/")) {
      const code = termFromSeasonYear(part, fallbackYear);
      if (code) out.add(code);
    }
  }
  if (out.size === 0) termsFromText(listing.title).forEach((t) => out.add(t));
  return [...out];
}

/**
 * The big community-maintained internship lists (SimplifyJobs/Summer20XX-Internships,
 * SimplifyJobs/New-Grad-Positions, vanshb03/Summer20XX-Internships). Config: { url, year? } — `year`
 * fills in seasons for lists that only say "Winter"/"Fall". Only active, visible listings are
 * returned, so a listing the maintainers mark closed simply stops appearing and goes through the
 * normal two-miss "possibly closed" flow.
 */
export const simplifyAdapter: SourceAdapter = {
  key: "simplify",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const url = source.config.url;
    if (typeof url !== "string" || !url) {
      throw new Error(`Source "${source.key}" is missing config.url for the simplify adapter`);
    }
    const fixedYear = typeof source.config.year === "number" ? source.config.year : null;
    const lists = await fetchAllYears(url, (u) => ctx.fetchJson<Listing[]>(u));

    return lists.flatMap(({ data: listings, year: listYear }) => {
      if (!Array.isArray(listings)) throw new Error(`Source "${source.key}": expected a JSON array`);
      // A Summer 2027 list's bare "Fall"/"Winter" seasons belong to the recruiting cycle before it.
      const year = fixedYear ?? (listYear != null ? listYear - 1 : null);
      return listings
        .filter((l) => l.active !== false && l.is_visible !== false && l.url && l.title && l.company_name)
        .map((l) => {
          const locations = l.locations ?? [];
          return {
            company: l.company_name.trim(),
            title: l.title.trim(),
            url: l.url,
            location: locations.join(" · ") || undefined,
            postedAt: l.date_posted ? new Date(l.date_posted * 1000) : undefined,
            terms: termsFor(l, year),
            category: categoryFromLabel(l.category) ?? undefined,
            region: regionForLocations(locations) ?? undefined,
          };
        });
    });
  },
};
