import { createHash } from "node:crypto";
import { slugify } from "@/lib/format";

/** Lowercases the host, drops the hash, and strips all query params (tracking params churn constantly). */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function externalKeyFor(url: string, title: string): string {
  const input = `${normalizeUrl(url)}|${slugify(title)}`;
  return createHash("sha1").update(input).digest("hex");
}
