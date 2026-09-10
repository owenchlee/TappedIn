import * as cheerio from "cheerio";
import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type GenericCssConfig = {
  listSelector: string;
  titleSelector: string;
  linkSelector?: string;
  locationSelector?: string;
  baseUrl?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Fallback adapter for sites without a JSON API. Explicitly the fallback, not the default: CSS
 * selectors rot whenever a site redesigns, and the diff's zero-result guard is the safety net for
 * exactly that failure mode.
 */
export const genericCssAdapter: SourceAdapter = {
  key: "generic-css",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const config = source.config as unknown as GenericCssConfig;
    if (!config.listSelector || !config.titleSelector) {
      throw new Error(`Source "${source.key}" is missing listSelector/titleSelector for the generic-css adapter`);
    }

    const html = await ctx.fetchText(source.careerUrl);
    const $ = cheerio.load(html);
    const baseUrl = config.baseUrl ?? source.careerUrl;

    const postings: RawPosting[] = [];
    $(config.listSelector).each((_, el) => {
      const node = $(el);
      const title = asString(node.find(config.titleSelector).first().text());
      if (!title) return;

      const linkEl = config.linkSelector ? node.find(config.linkSelector).first() : node;
      const href = asString(linkEl.attr("href")) ?? asString(node.attr("href"));
      if (!href) return;

      let url: string;
      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        return;
      }

      const location = config.locationSelector
        ? asString(node.find(config.locationSelector).first().text())
        : undefined;

      postings.push({ title, url, location });
    });

    return postings;
  },
};
