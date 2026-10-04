import { categoryFromTitle, regionForLocation } from "@/lib/sources/normalize";
import { plausibleTerms, termsFromText } from "@/lib/terms";
import type { RawPosting } from "@/lib/sources/types";

/** The source's terms, else the title's, minus any that ended before the job was posted. */
export function postingTerms(sourceTerms: string[], title: string, postedAt: Date | null | undefined): string[] {
  const fromSource = plausibleTerms(sourceTerms, postedAt);
  return fromSource.length > 0 ? fromSource : plausibleTerms(termsFromText(title), postedAt);
}

/** Fills the facets a source didn't provide (term, region, category) from the title and location. */
export function enrich(p: RawPosting): RawPosting {
  return {
    ...p,
    terms: postingTerms(p.terms ?? [], p.title, p.postedAt),
    region: p.region ?? regionForLocation(p.location) ?? undefined,
    category: p.category ?? categoryFromTitle(p.title),
  };
}
