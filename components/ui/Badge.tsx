import { clsx } from "clsx";

export type BadgeVariant = "muted" | "new" | "urgent" | "overdue" | "accent" | "sky" | "violet" | "amber" | "emerald" | "rose" | "zinc";

export const BADGE_CLASSES: Record<BadgeVariant, string> = {
  muted: "bg-surface-2 text-muted ring-border",
  new: "bg-new/12 text-new ring-new/25",
  urgent: "bg-urgent/12 text-urgent ring-urgent/25",
  overdue: "bg-overdue/12 text-overdue ring-overdue/25",
  accent: "bg-accent/12 text-accent ring-accent/25",
  sky: "bg-sky/12 text-sky ring-sky/25",
  violet: "bg-violet/12 text-violet ring-violet/25",
  amber: "bg-amber/12 text-amber ring-amber/25",
  emerald: "bg-emerald/12 text-emerald ring-emerald/25",
  rose: "bg-rose/12 text-rose ring-rose/25",
  zinc: "bg-zinc/12 text-zinc ring-zinc/25",
};

export function Badge({
  children,
  variant = "muted",
  className,
  title,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap ring-1 ring-inset",
        BADGE_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
