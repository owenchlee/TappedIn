import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type SrPosting = {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
};

/** SmartRecruiters public API: https://api.smartrecruiters.com/v1/companies/<company>/postings. Config: { company }. */
export const smartRecruitersAdapter: SourceAdapter = {
  key: "smartrecruiters",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const company = source.config.company;
    if (typeof company !== "string" || !company) {
      throw new Error(`Source "${source.key}" is missing config.company for the smartrecruiters adapter`);
    }
    const postings: RawPosting[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const data = await ctx.fetchJson<{ content?: SrPosting[] }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100&offset=${offset}`,
      );
      const page = data.content ?? [];
      for (const p of page) {
        const loc = p.location;
        const country = loc?.country === "ca" ? "Canada" : loc?.country?.toUpperCase();
        postings.push({
          title: p.name.trim(),
          url: `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${p.id}`,
          location: [loc?.city, loc?.region, country, loc?.remote ? "Remote" : null].filter(Boolean).join(", ") || undefined,
          postedAt: p.releasedDate ? new Date(p.releasedDate) : undefined,
        });
      }
      if (page.length < 100) break;
    }
    return postings;
  },
};
