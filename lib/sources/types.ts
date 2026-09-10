import type { SourceAdapterKey } from "@/lib/types";

export type RawPosting = {
  title: string;
  url: string;
  location?: string;
  postedAt?: Date;
  deadline?: Date;
};

export type SourceMatch = {
  includeTitle?: string;
  excludeTitle?: string;
  includeLocation?: string;
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
