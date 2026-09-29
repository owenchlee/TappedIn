import type { JobCategory, Region, SourceAdapterKey } from "@/lib/types";

export type RawPosting = {
  title: string;
  url: string;
  location?: string;
  postedAt?: Date;
  deadline?: Date;
  /** Aggregator sources (Simplify, the Canadian list) list many companies — the source name isn't it. */
  company?: string;
  terms?: string[];
  category?: JobCategory;
  region?: Region;
};

export type SourceMatch = {
  includeTitle?: string;
  excludeTitle?: string;
  includeLocation?: string;
  /** Keep only postings whose inferred region is in this list (e.g. ["canada", "remote", "us"]). */
  regions?: Region[];
};

export type LoadedSource = {
  key: string;
  name: string;
  careerUrl: string;
  adapter: SourceAdapterKey;
  config: Record<string, unknown>;
  match?: SourceMatch;
  enabled: boolean;
};

export type FetchCtx = {
  fetchText(url: string): Promise<string>;
  fetchJson<T = unknown>(url: string): Promise<T>;
  postJson<T = unknown>(url: string, body: unknown): Promise<T>;
};

export type SourceAdapter = {
  key: SourceAdapterKey;
  fetch(source: LoadedSource, ctx: FetchCtx): Promise<RawPosting[]>;
};

export class SourceFetchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SourceFetchError";
    this.status = status;
  }
}
