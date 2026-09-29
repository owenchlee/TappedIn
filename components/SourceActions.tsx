"use client";

import { useState, useTransition } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { refreshEverything, runSourceNow, setSourceEnabled } from "@/actions/sources";

export function SourceActions({ sourceKey, enabled }: { sourceKey: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {lastResult && <span className="text-xs text-muted">{lastResult}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setLastResult(null);
            const summary = await runSourceNow(sourceKey);
            setLastResult(summary.ok ? `+${summary.created} new, ${summary.touched} still up, ${summary.missed} missing` : `Failed: ${summary.error}`);
          })
        }
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Play />}
        Run now
      </Button>
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => startTransition(() => setSourceEnabled(sourceKey, !enabled))}>
        {enabled ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}

export function RefreshAllButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-muted">{result}</span>}
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            const r = await refreshEverything();
            setResult(r.error ?? `+${r.created} new jobs${r.failed ? ` · ${r.failed} failed` : ""}`);
          })
        }
      >
        {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {isPending ? "Refreshing…" : "Refresh everything"}
      </Button>
    </div>
  );
}
