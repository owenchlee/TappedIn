"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Check, Trash2 } from "lucide-react";
import { setStage, untrack } from "@/actions/applications";
import { Button } from "@/components/ui/Button";
import { statusDotClass } from "@/components/StatusPill";
import { CLOSED_STAGES, STAGES_BY_CATEGORY, stageLabel, type SavedCategory, type SavedStatus } from "@/lib/types";

/** Stepper across the pipeline, plus buttons for the terminal outcomes. */
export function StageControl({ id, status, category }: { id: string; status: SavedStatus; category: SavedCategory }) {
  const router = useRouter();
  const [current, setCurrent] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();
  const stages = STAGES_BY_CATEGORY[category];
  const pipeline = stages.filter((s) => !(CLOSED_STAGES as readonly string[]).includes(s) || s === "accepted" || s === "attended");
  const outcomes = stages.filter((s) => ["rejected", "ghosted", "withdrawn"].includes(s));
  const currentIndex = pipeline.indexOf(current);

  function choose(next: SavedStatus) {
    startTransition(async () => {
      setCurrent(next);
      await setStage(id, next);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ol className="flex flex-wrap items-center gap-1">
        {pipeline.map((stage, i) => {
          const done = currentIndex >= 0 && i < currentIndex;
          const active = stage === current;
          return (
            <li key={stage} className="flex items-center gap-1">
              {i > 0 && <span className={clsx("h-px w-3 sm:w-5", done || active ? "bg-accent/60" : "bg-border-strong")} />}
              <button
                type="button"
                disabled={isPending}
                onClick={() => choose(stage)}
                className={clsx(
                  "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-fg shadow-card"
                    : done
                      ? "bg-accent-soft text-accent hover:bg-accent/20"
                      : "text-muted ring-1 ring-border ring-inset hover:bg-surface-2 hover:text-text",
                )}
              >
                {done && <Check className="size-3" />}
                {stageLabel(stage, category)}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-1.5">
        {outcomes.map((stage) => (
          <button
            key={stage}
            type="button"
            disabled={isPending}
            onClick={() => choose(stage)}
            className={clsx(
              "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
              current === stage ? "bg-surface-3 text-text ring-border-strong" : "text-muted ring-border hover:bg-surface-2",
            )}
          >
            <span className={clsx("size-1.5 rounded-full", statusDotClass(stage))} />
            {stageLabel(stage, category)}
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          aria-label="Stop tracking"
          title="Stop tracking"
          onClick={() => {
            if (!confirm("Stop tracking this application? Its timeline will be deleted.")) return;
            startTransition(async () => {
              await untrack(id);
              router.push("/applications");
            });
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
