"use client";

import { useOptimistic, useTransition } from "react";
import { clsx } from "clsx";
import { toggleSave } from "@/actions/saved";
import type { SavedCategory } from "@/lib/types";

export function SaveButton({
  category,
  itemId,
  initialSaved,
}: {
  category: SavedCategory;
  itemId: string;
  initialSaved: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(initialSaved);

  return (
    <button
      type="button"
      aria-pressed={optimisticSaved}
      aria-label={optimisticSaved ? "Remove from saved" : "Save"}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          setOptimisticSaved(!optimisticSaved);
          await toggleSave(category, itemId);
        });
      }}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50",
        optimisticSaved ? "text-accent-hover hover:bg-accent/15" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill={optimisticSaved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-4.5 w-4.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 3.5A1.5 1.5 0 016.5 2h7A1.5 1.5 0 0115 3.5v14.09a.5.5 0 01-.782.414L10 14.687l-4.218 3.317A.5.5 0 015 17.59V3.5z"
        />
      </svg>
    </button>
  );
}
