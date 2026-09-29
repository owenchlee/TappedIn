import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type AshbyJob = {
  title: string;
  jobUrl: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  publishedAt?: string;
};

/** Ashby's public posting API: https://api.ashbyhq.com/posting-api/job-board/<org>. Config: { org }. */
export const ashbyAdapter: SourceAdapter = {
  key: "ashby",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const org = source.config.org;
    if (typeof org !== "string" || !org) {
      throw new Error(`Source "${source.key}" is missing config.org for the ashby adapter`);
    }
    const data = await ctx.fetchJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`,
    );
    return (data.jobs ?? [])
      .filter((job) => job.isListed !== false)
      .map((job) => {
        const locations = [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)].filter(
          (l): l is string => Boolean(l),
        );
        if (job.isRemote && !locations.some((l) => /remote/i.test(l))) locations.push("Remote");
        return {
          title: job.title.trim(),
          url: job.jobUrl,
          location: locations.join(" · ") || undefined,
          postedAt: job.publishedAt ? new Date(job.publishedAt) : undefined,
        };
      });
  },
};
