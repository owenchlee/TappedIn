import { categoryFromTitle, regionForLocation } from "@/lib/sources/normalize";
import { termsFromText } from "@/lib/terms";
import type { RawPosting } from "@/lib/sources/types";

/** Fills the facets a source didn't provide (term, region, category) from the title and location. */
export function enrich(p: RawPosting): RawPosting {
  return {
    ...p,
    terms: p.terms && p.terms.length > 0 ? p.terms : termsFromText(p.title),
    region: p.region ?? regionForLocation(p.location) ?? undefined,
    category: p.category ?? categoryFromTitle(p.title),
  };
}
