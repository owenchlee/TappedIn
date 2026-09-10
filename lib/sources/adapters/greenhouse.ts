import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type GreenhouseJob = {
  absolute_url: string;
  title: string;
  location?: { name?: string };
  updated_at?: string;
  application_deadline?: string | null;
};

type GreenhouseResponse = { jobs: GreenhouseJob[] };

export const greenhouseAdapter: SourceAdapter = {
  key: "greenhouse",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const boardToken = source.config.boardToken;
    if (typeof boardToken !== "string" || !boardToken) {
      throw new Error(`Source "${source.key}" is missing config.boardToken for the greenhouse adapter`);
    }
    const data = await ctx.fetchJson<GreenhouseResponse>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=false`,
    );
    return (data.jobs ?? []).map((job) => ({
      title: job.title,
      url: job.absolute_url,
      location: job.location?.name,
      postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
      deadline: job.application_deadline ? new Date(job.application_deadline) : undefined,
    }));
  },
};
