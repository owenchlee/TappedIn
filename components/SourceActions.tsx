"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { runSourceNow, setSourceEnabled } from "@/actions/sources";

export function SourceActions({ sourceKey, enabled }: { sourceKey: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {lastResult && <span className="text-xs text-muted">{lastResult}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setLastResult(null);
            const summary = await runSourceNow(sourceKey);
            setLastResult(
              summary.ok
                ? `Created ${summary.created}, touched ${summary.touched}, missed ${summary.missed}`
                : `Failed: ${summary.error}`,
            );
          })
        }
      >
        {isPending ? "Running…" : "Run now"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => setSourceEnabled(sourceKey, !enabled))}
      >
        {enabled ? "Disable" : "Enable"}
      </Button>
    </div>
  );
}
