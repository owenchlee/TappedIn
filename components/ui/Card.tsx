import { clsx } from "clsx";
import type { Urgency } from "@/lib/types";

const URGENCY_BORDER: Record<Urgency, string> = {
  overdue: "border-l-2 border-l-overdue",
  today: "border-l-2 border-l-urgent",
  urgent: "border-l-2 border-l-urgent",
  soon: "",
  far: "",
  none: "",
};

export function Card({
  children,
  className,
  urgency = "none",
}: {
  children: React.ReactNode;
  className?: string;
  urgency?: Urgency;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-border bg-surface p-4",
        URGENCY_BORDER[urgency],
        className,
      )}
    >
      {children}
    </div>
  );
}
