import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type LeverPosting = {
  text: string;
  hostedUrl: string;
  // `allLocations` lists every office for multi-location postings (Waabi: Toronto + Pittsburgh + SF).
  categories?: { location?: string; allLocations?: string[] };
  createdAt?: number;
};

export const leverAdapter: SourceAdapter = {
  key: "lever",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const company = source.config.company;
    if (typeof company !== "string" || !company) {
      throw new Error(`Source "${source.key}" is missing config.company for the lever adapter`);
    }
    const data = await ctx.fetchJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`,
    );
    return (data ?? []).map((posting) => ({
      title: posting.text,
      url: posting.hostedUrl,
      location: [...new Set([posting.categories?.location, ...(posting.categories?.allLocations ?? [])].filter((l): l is string => Boolean(l)))].join(" · ") || undefined,
      postedAt: posting.createdAt ? new Date(posting.createdAt) : undefined,
    }));
  },
};
