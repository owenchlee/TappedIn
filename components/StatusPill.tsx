"use client";

import { clsx } from "clsx";
import type { BadgeVariant } from "@/components/ui/Badge";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: "new",
  rolling: "accent",
  unknown: "muted",
  closed: "muted",
  interested: "muted",
  applied: "accent",
  interview: "urgent",
  rejected: "overdue",
  accepted: "new",
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  muted: "bg-surface-2 text-muted ring-border-strong",
  new: "bg-new/15 text-new ring-new/40",
  urgent: "bg-urgent/15 text-urgent ring-urgent/40",
  overdue: "bg-overdue/15 text-overdue ring-overdue/40",
  accent: "bg-accent/15 text-accent-hover ring-accent/40",
};

function labelFor(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function StatusPill({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options?: readonly string[];
  onChange?: (next: string) => void;
  disabled?: boolean;
}) {
  const variant = STATUS_VARIANT[value] ?? "muted";
  const classes = clsx(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
    VARIANT_CLASSES[variant],
  );

  if (!onChange || !options) {
    return <span className={classes}>{labelFor(value)}</span>;
  }

  return (
    <select
      className={clsx(classes, "cursor-pointer appearance-none border-0 pr-5 outline-none")}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='currentColor'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 4px center",
        backgroundSize: "12px",
      }}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-surface text-text">
          {labelFor(opt)}
        </option>
      ))}
    </select>
  );
}
