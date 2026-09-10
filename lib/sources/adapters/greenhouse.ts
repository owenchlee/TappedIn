import { dateInputToStorage } from "@/lib/deadline";
import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type GreenhouseJob = {
  absolute_url: string;
  title: string;
  location?: { name?: string };
  updated_at?: string;
  application_deadline?: string | null;
};

type GreenhouseResponse = { jobs: GreenhouseJob[] };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Greenhouse's `application_deadline` is a date-only string ("2026-09-30"), not an instant — parse
 * it through the same UTC-noon convention every other deadline in the app uses, so it doesn't land
 * on the wrong calendar day once `daysUntil`/`urgencyOf` bucket it by the Toronto calendar day. */
function parseDeadline(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const dateOnly = DATE_ONLY.test(value) ? value : value.slice(0, 10);
  if (!DATE_ONLY.test(dateOnly)) return undefined;
  try {
    return dateInputToStorage(dateOnly);
  } catch {
    return undefined;
  }
}

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
      deadline: parseDeadline(job.application_deadline),
    }));
  },
};
