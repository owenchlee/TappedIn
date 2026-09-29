import Link from "next/link";
import { clsx } from "clsx";

/** Segmented control whose options are links (so filters live in the URL and survive reloads). */
export function LinkTabs({
  items,
  className,
}: {
  items: { href: string; label: React.ReactNode; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <div className={clsx("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          className={clsx(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
            item.active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {item.label}
          {item.count != null && <span className="text-muted-2 tabular-nums">{item.count}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Builds an href for the current page with some params replaced (undefined/"" removes a param). */
export function withParams(
  base: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
