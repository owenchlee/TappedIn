// Maps a posting URL to the public API that returns that one posting's text. Pure (no fetches), so
// the URL shapes are unit-tested against real links from the feed.

export type DetailTarget =
  | { kind: "greenhouse"; api: string }
  | { kind: "lever"; api: string }
  | { kind: "ashby"; org: string; id: string }
  | { kind: "smartrecruiters"; api: string }
  | { kind: "workday"; api: string }
  | { kind: "workable"; api: string }
  | { kind: "oracle"; api: string }
  | { kind: "html"; url: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveDetailTarget(rawUrl: string): DetailTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  // Greenhouse: job-boards.greenhouse.io/<board>/jobs/<id>, boards.greenhouse.io/<board>/jobs/<id>,
  // and embeds: boards.greenhouse.io/embed/job_app?for=<board>&token=<id>. A company's own site
  // with ?gh_jid= doesn't say which board it is, so it falls through to the page itself.
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const jobsAt = parts.indexOf("jobs");
    if (parts[0] !== "embed" && jobsAt === 1 && /^\d+$/.test(parts[2] ?? "")) {
      return { kind: "greenhouse", api: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parts[0])}/jobs/${parts[2]}` };
    }
    const board = url.searchParams.get("for");
    const id = url.searchParams.get("token") ?? url.searchParams.get("gh_jid");
    if (board && id && /^\d+$/.test(id)) {
      return { kind: "greenhouse", api: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}` };
    }
    return { kind: "html", url: rawUrl };
  }

  // Lever: jobs.lever.co/<company>/<uuid>[/apply] (EU boards live on jobs.eu.lever.co).
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    if (parts.length >= 2 && UUID.test(parts[1])) {
      const api = host === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
      return { kind: "lever", api: `https://${api}/v0/postings/${encodeURIComponent(parts[0])}/${parts[1]}` };
    }
    return null;
  }

  // Ashby: jobs.ashbyhq.com/<org>/<uuid>[/application]. The posting API has no single-job endpoint,
  // so the fetcher reads the org's board once and looks the id up.
  if (host === "jobs.ashbyhq.com") {
    if (parts.length >= 2 && UUID.test(parts[1])) return { kind: "ashby", org: decodeURIComponent(parts[0]), id: parts[1].toLowerCase() };
    return null;
  }

  // SmartRecruiters: jobs.smartrecruiters.com/<Company>/<numeric id>[-slug]
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    const id = /^(\d{6,})/.exec(parts[1] ?? "")?.[1];
    if (parts[0] && id) return { kind: "smartrecruiters", api: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(parts[0])}/postings/${id}` };
    return null;
  }

  // Workday: <tenant>.wdN.myworkdayjobs.com/[en-US/]<site>/job/<location>/<slug_REQ>
  if (/\.myworkdayjobs\.com$/.test(host)) {
    const tenant = host.split(".")[0];
    const rest = /^[a-z]{2}-[a-z]{2}$/i.test(parts[0] ?? "") ? parts.slice(1) : parts;
    const jobAt = rest.indexOf("job");
    if (jobAt === 1 && rest.length > 2) {
      const site = rest[0];
      const path = rest.slice(jobAt).join("/");
      return { kind: "workday", api: `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/${path}` };
    }
    return null;
  }

  // Workable: apply.workable.com/<account>/j/<shortcode>[/apply]
  if (host === "apply.workable.com") {
    const jAt = parts.indexOf("j");
    if (jAt === 1 && parts[2]) return { kind: "workable", api: `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(parts[0])}/jobs/${parts[2]}` };
    return null;
  }

  // Oracle Cloud HCM: <host>.oraclecloud.com/hcmUI/CandidateExperience/<lang>/sites/<site>/job/<id>.
  // The page is rendered by JavaScript; its REST API returns the posting.
  if (/\.oraclecloud\.com$/.test(host)) {
    const sitesAt = parts.indexOf("sites");
    const jobAt = parts.indexOf("job");
    const id = parts[jobAt + 1];
    if (sitesAt > 0 && jobAt === sitesAt + 2 && id && /^\d+$/.test(id)) {
      const finder = `ById;Id="${id}",siteNumber=${parts[sitesAt + 1]}`;
      return {
        kind: "oracle",
        api: `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=${encodeURIComponent(finder)}`,
      };
    }
  }

  return { kind: "html", url: rawUrl };
}
