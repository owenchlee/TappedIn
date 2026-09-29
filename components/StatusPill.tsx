"use client";

import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { BADGE_CLASSES, type BadgeVariant } from "@/components/ui/Badge";
import { stageLabel, type SavedCategory } from "@/lib/types";

export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  // posting / org availability
  open: "emerald",
  rolling: "accent",
  unknown: "muted",
  closed: "muted",
  // application stages
  interested: "muted",
  applied: "sky",
  oa: "violet",
  interview: "amber",
  offer: "emerald",
  accepted: "emerald",
  attended: "emerald",
  rejected: "rose",
  ghosted: "zinc",
  withdrawn: "zinc",
};

const DOT: Record<BadgeVariant, string> = {
  muted: "bg-muted-2",
  new: "bg-new",
  urgent: "bg-urgent",
  overdue: "bg-overdue",
  accent: "bg-accent",
  sky: "bg-sky",
  violet: "bg-violet",
  amber: "bg-amber",
  emerald: "bg-emerald",
  rose: "bg-rose",
  zinc: "bg-zinc",
};

export function statusDotClass(value: string): string {
  return DOT[STATUS_VARIANT[value] ?? "muted"];
}

function labelFor(value: string, category?: SavedCategory): string {
  const staged = stageLabel(value, category);
  if (staged !== value) return staged;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function StatusPill({
  value,
  options,
  onChange,
  disabled,
  category,
  className,
}: {
  value: string;
  options?: readonly string[];
  onChange?: (next: string) => void;
  disabled?: boolean;
  category?: SavedCategory;
  className?: string;
}) {
  const variant = STATUS_VARIANT[value] ?? "muted";
  const classes = clsx(
    "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium ring-1 ring-inset",
    BADGE_CLASSES[variant],
    className,
  );
  const dot = <span className={clsx("size-1.5 rounded-full", DOT[variant])} />;

  if (!onChange || !options) {
    return (
      <span className={classes}>
        {dot}
        {labelFor(value, category)}
      </span>
    );
  }

  return (
    <label className={clsx(classes, "relative cursor-pointer pr-1", disabled && "opacity-60")}>
      {dot}
      <span>{labelFor(value, category)}</span>
      <ChevronDown className="size-3 opacity-70" />
      <select
        aria-label="Change status"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labelFor(opt, category)}
          </option>
        ))}
      </select>
    </label>
  );
}
