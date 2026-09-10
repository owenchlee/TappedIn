import { clsx } from "clsx";

export type BadgeVariant = "muted" | "new" | "urgent" | "overdue" | "accent";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  muted: "bg-surface-2 text-muted ring-1 ring-border-strong",
  new: "bg-new/15 text-new ring-1 ring-new/40",
  urgent: "bg-urgent/15 text-urgent ring-1 ring-urgent/40",
  overdue: "bg-overdue/15 text-overdue ring-1 ring-overdue/40",
  accent: "bg-accent/15 text-accent-hover ring-1 ring-accent/40",
};

export function Badge({
  children,
  variant = "muted",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
