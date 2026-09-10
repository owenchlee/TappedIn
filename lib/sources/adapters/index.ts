import type { SourceAdapter } from "@/lib/sources/types";
import type { SourceAdapterKey } from "@/lib/types";
import { greenhouseAdapter } from "@/lib/sources/adapters/greenhouse";
import { leverAdapter } from "@/lib/sources/adapters/lever";
import { genericCssAdapter } from "@/lib/sources/adapters/genericCss";
import { genericJsonAdapter } from "@/lib/sources/adapters/genericJson";

const ADAPTERS: Record<SourceAdapterKey, SourceAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  "generic-css": genericCssAdapter,
  "generic-json": genericJsonAdapter,
};

export function getAdapter(key: string): SourceAdapter {
  const adapter = ADAPTERS[key as SourceAdapterKey];
  if (!adapter) throw new Error(`Unknown source adapter: ${key}`);
  return adapter;
}
