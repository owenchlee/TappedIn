import { fetchAllYears } from "@/lib/sources/yearUrls";
import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function stripMarkdown(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

/** The link to follow in an "Apply" cell — for `[![Apply](badge.svg)](https://real-link)` that's the outer target. */
export function applyLink(text: string): string | null {
  const outer = /\]\((https?:\/\/[^)\s]+)\)\s*$/.exec(text.trim());
  if (outer && !/shields\.io|\.svg|\.png/.test(outer[1])) return outer[1];
  const href = /href="(https?:\/\/[^"]+)"/.exec(text);
  if (href) return href[1];
  const links = [...text.matchAll(/\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/shields\.io|\.svg|\.png/.test(u));
  return links[0] ?? null;
}

function parseDate(text: string, now: Date): Date | undefined {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(20\d{2})?/.exec(text);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return undefined;
  const year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  return new Date(Date.UTC(year, month, Number(m[2]), 12));
}

export function parseMarkdownTables(text: string, now: Date = new Date()): RawPosting[] {
  const postings: RawPosting[] = [];
  let header: string[] | null = null;
  let lastCompany = "";

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) {
      header = null;
      continue;
    }
    const row = cells(line);
    if (!header) {
      header = row.map((c) => stripMarkdown(c).toLowerCase());
      continue;
    }
    if (row.every((c) => /^:?-+:?$/.test(c))) continue; // separator row

    const col = (name: RegExp) => header!.findIndex((h) => name.test(h));
    const iCompany = col(/company/);
    const iRole = col(/role|position|title/);
    const iLocation = col(/location/);
    const iApply = col(/apply|link|application/);
    const iDate = col(/date|posted|added/);
    if (iCompany < 0 || iRole < 0) continue;

    let company = stripMarkdown(row[iCompany] ?? "");
    if (company === "↳" || company === "") company = lastCompany;
    else lastCompany = company;

    const title = stripMarkdown(row[iRole] ?? "");
    const link = applyLink(iApply >= 0 ? (row[iApply] ?? "") : line);
    if (!company || !title || !link) continue; // no link = closed (🔒)

    postings.push({
      company,
      title,
      url: link,
      location: iLocation >= 0 ? stripMarkdown(row[iLocation] ?? "") || undefined : undefined,
      postedAt: iDate >= 0 ? parseDate(row[iDate] ?? "", now) : undefined,
    });
  }
  return postings;
}

/**
 * GitHub README tables in the "| Company | Role | Location | Apply | Date |" shape most curated
 * internship lists use (e.g. negarprh/Canadian-Tech-Internships-2027). "↳" in the company column
 * means "same company as the row above"; rows whose apply cell has no link (🔒 Closed) are skipped.
 * Config: { url } — the raw README URL.
 */
export const markdownTableAdapter: SourceAdapter = {
  key: "markdown-table",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const url = source.config.url;
    if (typeof url !== "string" || !url) {
      throw new Error(`Source "${source.key}" is missing config.url for the markdown-table adapter`);
    }
    const pages = await fetchAllYears(url, (u) => ctx.fetchText(u));
    return pages.flatMap((p) => parseMarkdownTables(p.data));
  },
};
