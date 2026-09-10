import type { FetchCtx, LoadedSource, RawPosting, SourceAdapter } from "@/lib/sources/types";

type GenericJsonConfig = {
  endpoint: string;
  itemsPath: string;
  fields: { title: string; url: string; location?: string };
  baseUrl?: string;
};

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Config-driven extraction for hand-found XHR endpoints that don't match the Greenhouse/Lever shape. */
export const genericJsonAdapter: SourceAdapter = {
  key: "generic-json",
  async fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]> {
    const config = source.config as unknown as GenericJsonConfig;
    if (!config.endpoint || !config.itemsPath || !config.fields?.title || !config.fields?.url) {
      throw new Error(`Source "${source.key}" is missing endpoint/itemsPath/fields for the generic-json adapter`);
    }

    const data = await ctx.fetchJson(config.endpoint);
    const items = getPath(data, config.itemsPath);
    if (!Array.isArray(items)) {
      throw new Error(`Source "${source.key}": itemsPath "${config.itemsPath}" did not resolve to an array`);
    }

    const baseUrl = config.baseUrl ?? source.careerUrl;
    const postings: RawPosting[] = [];

    for (const item of items) {
      const title = asString(getPath(item, config.fields.title));
      const rawUrl = asString(getPath(item, config.fields.url));
      if (!title || !rawUrl) continue;

      let url: string;
      try {
        url = new URL(rawUrl, baseUrl).toString();
      } catch {
        continue;
      }

      const location = config.fields.location ? asString(getPath(item, config.fields.location)) : undefined;
      postings.push({ title, url, location });
    }

    return postings;
  },
};
