"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";

/**
 * A pill-shaped dropdown whose options are URLs, so filters stay in the URL like LinkTabs do but take
 * one slot in the toolbar instead of a whole row. Highlighted when set to anything but the first option.
 */
export function FilterSelect({
  label,
  options,
  className,
}: {
  label: string;
  options: { label: string; href: string; active: boolean }[];
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const index = Math.max(0, options.findIndex((o) => o.active));
  const isSet = index > 0;

  return (
    <label
      className={clsx(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-4 text-sm font-medium transition-colors",
        isSet ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-surface text-text shadow-card hover:border-border-strong",
        isPending && "opacity-70",
        className,
      )}
    >
      <span className="whitespace-nowrap">{options[index]?.label ?? label}</span>
      <ChevronDown className="size-4 opacity-60" />
      <select
        aria-label={label}
        value={index}
        onChange={(e) => {
          const next = options[Number(e.target.value)];
          if (next) startTransition(() => router.push(next.href, { scroll: false }));
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o, i) => (
          <option key={o.href} value={i}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
