import { prisma } from "@/lib/db";
import type { CompanySource } from "@/lib/generated/prisma/client";
import type { LoadedSource, SourceMatch } from "@/lib/sources/types";
import type { SourceAdapterKey } from "@/lib/types";

export function loadedSourceFromRow(row: CompanySource): LoadedSource {
  let parsed: Record<string, unknown> & { match?: SourceMatch } = {};
  try {
    parsed = JSON.parse(row.configJson);
  } catch {
    // Leave config empty; the adapter will throw a clear "missing config.x" error.
  }
  const { match, ...config } = parsed;

  return {
    key: row.key,
    name: row.name,
    careerUrl: row.careerUrl,
    adapter: row.adapter as SourceAdapterKey,
    config,
    match,
    enabled: row.enabled,
  };
}

export async function listEnabledSources(): Promise<LoadedSource[]> {
  const rows = await prisma.companySource.findMany({ where: { enabled: true }, orderBy: { key: "asc" } });
  return rows.map(loadedSourceFromRow);
}
