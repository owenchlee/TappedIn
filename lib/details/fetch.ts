import * as cheerio from "cheerio";
import { resolveDetailTarget, type DetailTarget } from "@/lib/details/resolve";

export type DetailResult =
  | { status: "ok"; text: string }
  /** The ATS itself says the posting no longer exists. */
  | { status: "gone"; reason: string }
  /** No way to read this posting (unknown URL shape, or a page rendered entirely by JavaScript). */
  | { status: "unsupported"; reason: string }
  | { status: "error"; reason: string };

/** Long enough for every requirement section; some boards append pages of benefits boilerplate. */
export const MAX_DETAIL_CHARS = 20_000;
const TIMEOUT_MS = 15_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).hostname}`);
  }
}

function userAgent(): string {
  return process.env.FETCH_USER_AGENT ?? "TappedIn/1.0 (personal job tracker)";
}

async function request(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res;
}

const getJson = async <T>(url: string) => (await (await request(url, "application/json")).json()) as T;

/** HTML (or entity-escaped HTML, as Greenhouse sends it) to readable plain text with line breaks. */
export function htmlToText(html: string): string {
  // Greenhouse's `content` is HTML whose tags are themselves entity-escaped ("&lt;p&gt;").
  const unescaped = /&lt;\/?[a-z]/i.test(html) && !/<\/?[a-z][^>]*>/i.test(html) ? cheerio.load(`<div>${html}</div>`)("div").text() : html;
  const $ = cheerio.load(unescaped);
  $("script, style, noscript, svg, template").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, section, ul, ol").each((_, el) => {
    $(el).append("\n");
  });
  $("li").each((_, el) => {
    $(el).prepend("• ");
  });
  return tidy($.root().text());
}

export function tidy(text: string): string {
  return text
    .replace(/ /g, " ")
    // Some Workday tenants double-escape their line breaks, leaving a literal "&#xa;" in the text.
    .replace(/&#(xa|10);/gi, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_DETAIL_CHARS);
}

// ---------------------------------------------------------------------------------------------

type AshbyBoardJob = { id: string; title?: string; descriptionPlain?: string; descriptionHtml?: string; isListed?: boolean };

/** One read of each Ashby board per run: its API has no single-posting endpoint. */
export type DetailCache = { ashby: Map<string, Promise<Map<string, AshbyBoardJob>>> };
export const createDetailCache = (): DetailCache => ({ ashby: new Map() });

async function ashbyBoard(org: string, cache: DetailCache): Promise<Map<string, AshbyBoardJob>> {
  let board = cache.ashby.get(org);
  if (!board) {
    board = getJson<{ jobs?: AshbyBoardJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=false`).then(
      (d) => new Map((d.jobs ?? []).map((j) => [j.id.toLowerCase(), j])),
    );
    cache.ashby.set(org, board);
  }
  return board;
}

type JsonLd = { "@type"?: string | string[]; "@graph"?: JsonLd[]; description?: string; title?: string; validThrough?: string };

function findJobPosting(node: unknown): JsonLd | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as JsonLd;
  const type = obj["@type"];
  if ((Array.isArray(type) ? type : [type]).includes("JobPosting") && typeof obj.description === "string") return obj;
  return obj["@graph"] ? findJobPosting(obj["@graph"]) : null;
}

// Phrases careers sites show in place of a removed posting. Only trusted on short pages, so a live
// posting that merely mentions "no longer accepting applications after Oct 1" isn't closed.
const GONE_PHRASES =
  /\b(this (job|position|posting|role|requisition) (is )?(no longer|not) (available|active|accepting)|(job|position|posting) (has been|was) (filled|closed|removed)|no longer accepting applications|the job you are looking for (is|was) (not|no longer)|job not found|position (is )?closed)\b/i;

export function extractFromHtml(html: string, finalUrl: string): DetailResult {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const posting = findJobPosting(JSON.parse($(el).text()));
      if (posting?.description) {
        const text = htmlToText(posting.description);
        if (text.length >= 200) return { status: "ok", text };
      }
    } catch {
      // Malformed JSON-LD is common; fall back to the page text.
    }
  }
  if (/greenhouse\.io$/.test(new URL(finalUrl).hostname) && new URL(finalUrl).searchParams.get("error") === "true") {
    return { status: "gone", reason: "Greenhouse redirected to the board with error=true" };
  }
  $("script, style, noscript, svg, nav, header, footer, form, iframe, template").remove();
  const main = $("main").length ? $("main") : $("body");
  const text = htmlToText(main.html() ?? "");
  if (text.length < 4_000 && GONE_PHRASES.test(text)) return { status: "gone", reason: `Page says: "${GONE_PHRASES.exec(text)?.[0]}"` };
  // A client-rendered page (TikTok, Oracle, iCIMS without JS) has a few menu words and no posting.
  if (text.length < 400 || !/\b(responsibilit|qualification|requirement|you will|you'll|about the role|what we|experience|skills)/i.test(text)) {
    return { status: "unsupported", reason: "The page has no readable posting without JavaScript" };
  }
  return { status: "ok", text };
}

async function fetchTarget(target: DetailTarget, cache: DetailCache): Promise<DetailResult> {
  switch (target.kind) {
    case "greenhouse": {
      const d = await getJson<{ content?: string; title?: string }>(target.api);
      return { status: "ok", text: htmlToText(d.content ?? "") };
    }
    case "lever": {
      const d = await getJson<{ descriptionPlain?: string; lists?: { text?: string; content?: string }[]; additionalPlain?: string }>(target.api);
      const lists = (d.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`).join("\n\n");
      return { status: "ok", text: tidy([d.descriptionPlain, lists, d.additionalPlain].filter(Boolean).join("\n\n")) };
    }
    case "ashby": {
      const board = await ashbyBoard(target.org, cache);
      const job = board.get(target.id);
      if (!job || job.isListed === false) return { status: "gone", reason: `No longer on ${target.org}'s Ashby board` };
      return { status: "ok", text: job.descriptionPlain ? tidy(job.descriptionPlain) : htmlToText(job.descriptionHtml ?? "") };
    }
    case "smartrecruiters": {
      const d = await getJson<{ active?: boolean; jobAd?: { sections?: Record<string, { title?: string; text?: string }> } }>(target.api);
      if (d.active === false) return { status: "gone", reason: "SmartRecruiters marks it inactive" };
      const sections = Object.values(d.jobAd?.sections ?? {}).map((s) => `${s.title ?? ""}\n${htmlToText(s.text ?? "")}`);
      return { status: "ok", text: tidy(sections.join("\n\n")) };
    }
    case "workday": {
      const d = await getJson<{ jobPostingInfo?: { jobDescription?: string; canApply?: boolean; endDate?: string } }>(target.api);
      if (!d.jobPostingInfo) return { status: "gone", reason: "Workday has no posting at this address" };
      return { status: "ok", text: htmlToText(d.jobPostingInfo.jobDescription ?? "") };
    }
    case "workable": {
      const d = await getJson<{ state?: string; description?: string; requirements?: string; benefits?: string }>(target.api);
      if (d.state && d.state !== "published") return { status: "gone", reason: `Workable says the job is ${d.state}` };
      return { status: "ok", text: htmlToText([d.description, d.requirements, d.benefits].filter(Boolean).join("\n")) };
    }
    case "oracle": {
      type Req = { ExternalDescriptionStr?: string; ExternalResponsibilitiesStr?: string; ExternalQualificationsStr?: string };
      const d = await getJson<{ items?: Req[] }>(target.api);
      const req = d.items?.[0];
      if (!req) return { status: "gone", reason: "Oracle has no posting with this id" };
      const parts = [req.ExternalDescriptionStr, req.ExternalResponsibilitiesStr, req.ExternalQualificationsStr].filter((h): h is string => Boolean(h));
      return { status: "ok", text: tidy(parts.map(htmlToText).join("\n\n")) };
    }
    case "html": {
      const res = await request(target.url, "text/html,application/xhtml+xml");
      return extractFromHtml(await res.text(), res.url || target.url);
    }
  }
}

/**
 * Reads one posting's text. "gone" only comes from a definite answer (an ATS API's 404/410 or its
 * own "not listed" state, or a removed-posting page), never from a timeout or a blocked request.
 */
export async function fetchPostingDetail(url: string, cache: DetailCache = createDetailCache()): Promise<DetailResult> {
  const target = resolveDetailTarget(url);
  if (!target) return { status: "unsupported", reason: "Unrecognised posting link" };
  try {
    const result = await fetchTarget(target, cache);
    if (result.status === "ok" && result.text.length < 80) return { status: "unsupported", reason: "The posting has almost no text" };
    return result;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 410) && target.kind !== "html") {
      return { status: "gone", reason: `${target.kind} says the posting doesn't exist (${err.status})` };
    }
    if (err instanceof HttpError && err.status === 410) return { status: "gone", reason: "The page says the posting was removed (410)" };
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) return { status: "unsupported", reason: err.message };
    return { status: "error", reason: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}
