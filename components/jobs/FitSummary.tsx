import { clsx } from "clsx";
import { Check, Minus, X } from "lucide-react";

/** How good a match a score is, for colour and the screen-reader label. */
export function fitTier(score: number): { label: string; className: string } {
  if (score >= 75) return { label: "Great match", className: "bg-emerald/12 text-emerald ring-emerald/25" };
  if (score >= 60) return { label: "Good match", className: "bg-accent/12 text-accent ring-accent/25" };
  if (score >= 40) return { label: "Weak match", className: "bg-surface-2 text-muted ring-border" };
  return { label: "Poor match", className: "bg-overdue/10 text-overdue ring-overdue/20" };
}

export function FitScore({ score, reasons }: { score: number; reasons: string[] }) {
  const tier = fitTier(score);
  return (
    <span
      title={`${tier.label} (${score}/100)\n${reasons.map((r) => `${r[0] === "+" ? "✓" : "✗"} ${r.slice(1)}`).join("\n")}`}
      className={clsx("inline-flex h-5 min-w-8 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset", tier.className)}
    >
      <span className="sr-only">{tier.label}: </span>
      {score}
    </span>
  );
}

/**
 * The reasons behind a job's score, e.g. "✓ Summer '27 · ✓ In Canada · ✗ For grads 2027–2028".
 * Blockers (you can't apply) show in red first.
 */
export function FitReasons({ reasons, blocked, max = 4 }: { reasons: string[]; blocked: boolean; max?: number }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Why this score">
      {reasons.slice(0, max).map((r, i) => {
        const good = r[0] === "+";
        const blocker = !good && blocked && i === 0;
        const Icon = good ? Check : blocker ? X : Minus;
        return (
          <li key={r} className={clsx("inline-flex items-center gap-1", good ? "text-muted" : blocker ? "font-medium text-overdue" : "text-muted-2")}>
            <Icon className={clsx("size-3 shrink-0", good && "text-emerald")} aria-hidden />
            {r.slice(1)}
          </li>
        );
      })}
    </ul>
  );
}
