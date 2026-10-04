import Link from "next/link";
import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  tone = "text",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "text" | "accent" | "amber" | "emerald";
  href?: string;
}) {
  const tones = { text: "text-text", accent: "text-accent", amber: "text-amber", emerald: "text-emerald" };
  const body = (
    <div className="group flex h-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
        {href && <ChevronRight className="size-4 text-muted-2 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <div className={clsx("text-3xl font-semibold tracking-tight tabular-nums", tones[tone])}>{value}</div>
      {hint && <div className="text-xs text-muted-2">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
