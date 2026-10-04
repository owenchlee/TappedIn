import { describe, expect, it } from "vitest";
import { workdayAdapter } from "@/lib/sources/adapters/workday";
import type { FetchCtx, LoadedSource } from "@/lib/sources/types";

const source: LoadedSource = {
  key: "td",
  name: "TD",
  careerUrl: "https://jobs.td.com/",
  adapter: "workday",
  enabled: true,
  config: { host: "td.wd3.myworkdayjobs.com", tenant: "td", site: "TD_Bank_Careers", searchText: "co-op intern" },
  match: { includeTitle: "\\b(intern|co-?op)\\b" },
};

// Real Workday behaviour (Oct 2026): total only on the first page, 0 afterwards.
function fakeCtx(totalJobs: number): FetchCtx & { detailCalls: string[] } {
  const detailCalls: string[] = [];
  return {
    detailCalls,
    async postJson<T>(_url: string, body: unknown) {
      const { offset, limit } = body as { offset: number; limit: number };
      const n = Math.max(0, Math.min(limit, totalJobs - offset));
      const jobPostings = Array.from({ length: n }, (_, i) => {
        const k = offset + i;
        return k === 0
          ? { title: "Data Analytics Intern / Co-op", externalPath: "/job/Montreal/Data_R_1", locationsText: "2 Locations" }
          : k === 1
            ? { title: "Senior Developer", externalPath: "/job/Toronto/Senior_R_2", locationsText: "3 Locations" }
            : { title: `Co-op ${k}`, externalPath: `/job/Toronto/Coop_R_${k}`, locationsText: "Toronto, Ontario" };
      });
      return { total: offset === 0 ? totalJobs : 0, jobPostings } as T;
    },
    async fetchJson<T>(url: string) {
      detailCalls.push(url);
      return { jobPostingInfo: { location: "Montréal, Québec", additionalLocations: ["Toronto, Ontario"] } } as T;
    },
    fetchText: () => Promise.reject(new Error("unused")),
  };
}

describe("workday adapter", () => {
  it("keeps paging past page 2 even though Workday reports total: 0 there", async () => {
    const postings = await workdayAdapter.fetch(source, fakeCtx(95));
    expect(postings).toHaveLength(95);
  });

  it("looks up the real locations for multi-location student jobs only", async () => {
    const ctx = fakeCtx(5);
    const postings = await workdayAdapter.fetch(source, ctx);
    expect(postings[0].location).toBe("Montréal, Québec · Toronto, Ontario");
    expect(postings[1].location).toBe("3 Locations"); // "Senior Developer" isn't a student title: not fetched
    expect(ctx.detailCalls).toEqual(["https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/job/Montreal/Data_R_1"]);
  });
});
