import { clsx } from "clsx";
import type { Urgency } from "@/lib/types";

const URGENCY_RING: Record<Urgency, string> = {
  overdue: "before:bg-overdue",
  today: "before:bg-urgent",
  urgent: "before:bg-urgent",
  soon: "",
  far: "",
  none: "",
};

export function Card({
  children,
  className,
  urgency = "none",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  urgency?: Urgency;
  padded?: boolean;
}) {
  const accent = URGENCY_RING[urgency];
  return (
    <div
      className={clsx(
        "relative rounded-2xl border border-border bg-surface shadow-card",
        padded && "p-5",
        accent && "overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        accent,
        className,
      )}
    >
      {children}
    </div>
  );
}
