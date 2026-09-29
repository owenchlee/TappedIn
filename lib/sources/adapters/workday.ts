import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type WorkdayJob = { title: string; externalPath: string; locationsText?: string; postedOn?: string };
type WorkdayResponse = { total?: number; jobPostings?: WorkdayJob[] };

const PAGE_SIZE = 20; // Workday rejects larger pages.

/** "Posted Today" / "Posted Yesterday" / "Posted 6 Days Ago" / "Posted 30+ Days Ago" → a Date. */
export function parsePostedOn(text: string | undefined, now: Date = new Date()): Date | undefined {
  if (!text) return undefined;
  if (/today/i.test(text)) return now;
  if (/yesterday/i.test(text)) return new Date(now.getTime() - 86_400_000);
  const m = /(\d+)\+?\s*days?\s+ago/i.exec(text);
  return m ? new Date(now.getTime() - Number(m[1]) * 86_400_000) : undefined;
}
const MAX_PAGES = 15;

/**
 * Workday career sites (banks, telcos, Ciena, …) expose a JSON search endpoint behind the page:
 * POST https://<host>/wday/cxs/<tenant>/<site>/jobs. Config: { host, tenant, site, searchText? }.
 * Read them off any job URL: https://ciena.wd5.myworkdayjobs.com/Careers/job/… →
 * host "ciena.wd5.myworkdayjobs.com", tenant "ciena", site "Careers".
 */
export const workdayAdapter: SourceAdapter = {
  key: "workday",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const { host, tenant, site } = source.config as { host?: string; tenant?: string; site?: string };
    const searchText = typeof source.config.searchText === "string" ? source.config.searchText : "";
    if (!host || !tenant || !site) {
      throw new Error(`Source "${source.key}" is missing config.host/tenant/site for the workday adapter`);
    }
    const endpoint = `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`;

    const postings: RawPosting[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await ctx.postJson<WorkdayResponse>(endpoint, {
        appliedFacets: {},
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        searchText,
      });
      const jobs = data.jobPostings ?? [];
      for (const job of jobs) {
        postings.push({
          title: job.title.trim(),
          url: `https://${host}/${site}${job.externalPath}`,
          location: job.locationsText,
          postedAt: parsePostedOn(job.postedOn),
        });
      }
      if (jobs.length < PAGE_SIZE || (data.total != null && postings.length >= data.total)) break;
    }
    return postings;
  },
};
