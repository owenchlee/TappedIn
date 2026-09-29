import Link from "next/link";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "accent",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: "accent" | "amber" | "emerald" | "sky" | "violet";
  href?: string;
}) {
  const tones = {
    accent: "bg-accent/12 text-accent",
    amber: "bg-amber/12 text-amber",
    emerald: "bg-emerald/12 text-emerald",
    sky: "bg-sky/12 text-sky",
    violet: "bg-violet/12 text-violet",
  };
  const body = (
    <div className="flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={clsx("flex size-7 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-text tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-2">{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
