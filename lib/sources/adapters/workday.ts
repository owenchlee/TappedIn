import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type WorkdayJob = { title: string; externalPath: string; locationsText?: string; postedOn?: string };
type WorkdayResponse = { total?: number; jobPostings?: WorkdayJob[] };
type WorkdayDetail = { jobPostingInfo?: { location?: string; additionalLocations?: string[] } };

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

    const postings: (RawPosting & { externalPath: string })[] = [];
    // Workday only reports the real total on the first page; later pages say total: 0. Trusting
    // that stopped every Workday source after 40 jobs (TD has 1,300+).
    let total: number | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await ctx.postJson<WorkdayResponse>(endpoint, {
        appliedFacets: {},
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        searchText,
      });
      if (page === 0 && data.total) total = data.total;
      const jobs = data.jobPostings ?? [];
      for (const job of jobs) {
        postings.push({
          title: job.title.trim(),
          url: `https://${host}/${site}${job.externalPath}`,
          location: job.locationsText,
          postedAt: parsePostedOn(job.postedOn),
          externalPath: job.externalPath,
        });
      }
      if (jobs.length < PAGE_SIZE || (total != null && postings.length >= total)) break;
    }

    // Multi-location jobs only say "2 Locations" in search results, so the region filter can't
    // place them (all of TD's Toronto/Montreal co-ops were dropped). Look those up, but only for
    // titles the source keeps anyway, to stay polite.
    const wanted = source.match?.includeTitle ? new RegExp(source.match.includeTitle, "i") : null;
    for (const p of postings) {
      if (!/^\d+ Locations?$/i.test(p.location ?? "") || (wanted && !wanted.test(p.title))) continue;
      const detail = await ctx.fetchJson<WorkdayDetail>(`https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}${p.externalPath}`).catch(() => null);
      const info = detail?.jobPostingInfo;
      const all = [info?.location, ...(info?.additionalLocations ?? [])].filter((l): l is string => Boolean(l));
      if (all.length) p.location = all.join(" · ");
    }
    return postings.map((p) => ({ title: p.title, url: p.url, location: p.location, postedAt: p.postedAt }));
  },
};
