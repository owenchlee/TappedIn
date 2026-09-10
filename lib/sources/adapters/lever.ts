import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type LeverPosting = {
  text: string;
  hostedUrl: string;
  categories?: { location?: string };
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
      location: posting.categories?.location,
      postedAt: posting.createdAt ? new Date(posting.createdAt) : undefined,
    }));
  },
};
