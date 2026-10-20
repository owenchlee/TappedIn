// Finds where a job is really applied to. Job boards like csjobs.ca and LinkedIn only point at the
// employer's posting; Owen applies on the employer's own site (its careers page or ATS), never through
// a third party (his call, 2026-10-13). No Next or Prisma imports: scripts/prefill.ts uses this too.

/** Sites that list other companies' jobs. A URL on one of these is never the place to apply. */
const THIRD_PARTY = [
  "csjobs.ca", "linkedin.com", "indeed.com", "indeed.ca", "glassdoor.com", "glassdoor.ca", "simplify.jobs",
  "ziprecruiter.com", "jobbank.gc.ca", "talent.com", "monster.ca", "monster.com", "eluta.ca", "wellfound.com",
  "builtin.com", "handshake.com", "joinhandshake.com", "jooble.org", "workopolis.com", "intern-list.com",
  "levels.fyi", "ycombinator.com", "jobright.ai", "otta.com", "welcometothejungle.com", "dice.com",
];

export function isThirdParty(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return THIRD_PARTY.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** likelyClosed: the job board dropped it and no public job board has it. Only a hint: Workday and company sites aren't searched. */
export type SourceResult = { url: string; how: string } | { url: null; likelyClosed?: boolean; how: string };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const STOP = new Set(["intern", "the", "and", "of", "a", "an", "to", "in", "for", "at", "with"]);

/** Title words, with co-op/intern/student/term noise folded away so "Software Developer Co-op" matches "Software Developer Intern (Summer 2027)". */
function words(title: string): Set<string> {
  const t = title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(co-?op|internship|intern|student|summer|fall|winter|spring|20\d\d|\d+\s*months?|term)\b/g, " intern ")
    .replace(/[^a-z0-9+#]+/g, " ");
  return new Set(t.split(" ").filter((w) => w && !STOP.has(w)));
}

export function titleMatch(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.max(x.size, y.size);
}

/** Board names a company probably uses: "Apera AI" → aperaai, apera-ai, apera. */
export function slugGuesses(company: string): string[] {
  const base = company.toLowerCase().replace(/&/g, " and ").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").trim();
  const trimmed = base.replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|company|technologies|technology|labs|group|holdings|insurance|ai|canada)\b/g, " ").trim();
  const out = [base.replace(/\s+/g, ""), base.replace(/\s+/g, "-"), trimmed.replace(/\s+/g, ""), trimmed.replace(/\s+/g, "-"), trimmed.split(/\s+/)[0]];
  return [...new Set(out)].filter((s) => s.length >= 2);
}

type Candidate = { title: string; url: string };

/** Every open job on the company's Greenhouse, Lever, Ashby, SmartRecruiters and Workable boards, by guessed board name. */
async function boardJobs(slug: string): Promise<Candidate[]> {
  const s = encodeURIComponent(slug);
  const [gh, lever, ashby, sr, workable] = await Promise.all([
    getJson<{ jobs?: { id: number; title: string }[] }>(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs`),
    getJson<{ text: string; hostedUrl: string }[]>(`https://api.lever.co/v0/postings/${s}?mode=json`),
    getJson<{ jobs?: { title: string; jobUrl: string }[] }>(`https://api.ashbyhq.com/posting-api/job-board/${s}`),
    getJson<{ content?: { id: string; name: string }[] }>(`https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`),
    getJson<{ jobs?: { title: string; shortcode: string }[] }>(`https://apply.workable.com/api/v1/widget/accounts/${s}`),
  ]);
  return [
    // absolute_url is often a careers-site wrapper (careerpuck etc.); the Greenhouse form itself is the source.
    ...(gh?.jobs ?? []).map((j) => ({ title: j.title, url: `https://job-boards.greenhouse.io/${s}/jobs/${j.id}` })),
    ...(Array.isArray(lever) ? lever : []).map((j) => ({ title: j.text, url: j.hostedUrl })),
    ...(ashby?.jobs ?? []).map((j) => ({ title: j.title, url: j.jobUrl })),
    ...(sr?.content ?? []).map((j) => ({ title: j.name, url: `https://jobs.smartrecruiters.com/${slug}/${j.id}` })),
    ...(workable?.jobs ?? []).map((j) => ({ title: j.title, url: `https://apply.workable.com/${slug}/j/${j.shortcode}/` })),
  ];
}

/** The posting's own link on csjobs.ca (its page loads it by script from this API). */
async function csjobsLink(rawUrl: string): Promise<{ link: string | null; gone: boolean }> {
  const id = /\/jobs\/(\d+)/.exec(new URL(rawUrl).pathname)?.[1];
  if (!id) return { link: null, gone: false };
  try {
    const res = await fetch(`https://csjobs.ca/api/v1/jobs/${id}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return { link: null, gone: true };
    const body = (await res.json()) as { job?: { link?: string } };
    return { link: body.job?.link ?? null, gone: false };
  } catch {
    return { link: null, gone: false };
  }
}

/**
 * The employer's own posting for a job found on a third-party board, or null when it can't be found
 * from public APIs (then the browser worker looks for it on the company's careers site).
 */
export async function findRealSource(job: { url: string; company: string; role: string }): Promise<SourceResult> {
  if (!isThirdParty(job.url)) return { url: job.url, how: "already the employer's site" };
  let link = job.url;
  let gone = false;
  if (new URL(job.url).hostname.endsWith("csjobs.ca")) {
    const cs = await csjobsLink(job.url);
    gone = cs.gone;
    if (cs.link) link = cs.link;
    if (!isThirdParty(link)) return { url: link, how: "csjobs.ca's apply link" };
  }
  let best: (Candidate & { score: number }) | null = null;
  for (const slug of slugGuesses(job.company)) {
    for (const c of await boardJobs(slug)) {
      const score = titleMatch(job.role, c.title);
      if (score >= 0.6 && (!best || score > best.score)) best = { ...c, score };
    }
    if (best && best.score >= 0.99) break;
  }
  if (best) return { url: best.url, how: `matched "${best.title}" on the company's job board` };
  // The board dropped it and no public board has it: probably closed, but the employer's site gets the last word.
  if (gone) return { url: null, likelyClosed: true, how: "csjobs.ca dropped the listing and it isn't on a public job board; may be closed" };
  return { url: null, how: `not on a public job board; ${link !== job.url ? `the listing points to ${link}` : "needs a search"}` };
}
