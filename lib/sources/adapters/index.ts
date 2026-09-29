import type { SourceAdapter } from "@/lib/sources/types";
import type { SourceAdapterKey } from "@/lib/types";
import { greenhouseAdapter } from "@/lib/sources/adapters/greenhouse";
import { leverAdapter } from "@/lib/sources/adapters/lever";
import { ashbyAdapter } from "@/lib/sources/adapters/ashby";
import { workdayAdapter } from "@/lib/sources/adapters/workday";
import { smartRecruitersAdapter } from "@/lib/sources/adapters/smartrecruiters";
import { simplifyAdapter } from "@/lib/sources/adapters/simplify";
import { markdownTableAdapter } from "@/lib/sources/adapters/markdownTable";
import { genericCssAdapter } from "@/lib/sources/adapters/genericCss";
import { genericJsonAdapter } from "@/lib/sources/adapters/genericJson";

const ADAPTERS: Record<SourceAdapterKey, SourceAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  workday: workdayAdapter,
  smartrecruiters: smartRecruitersAdapter,
  simplify: simplifyAdapter,
  "markdown-table": markdownTableAdapter,
  "generic-css": genericCssAdapter,
  "generic-json": genericJsonAdapter,
};

export function getAdapter(key: string): SourceAdapter {
  const adapter = ADAPTERS[key as SourceAdapterKey];
  if (!adapter) throw new Error(`Unknown source adapter: ${key}`);
  return adapter;
}
