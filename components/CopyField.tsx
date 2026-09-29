"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { FIELD_CLASSES } from "@/components/ui/Input";
import { clsx } from "clsx";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-1.5">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={clsx(FIELD_CLASSES, "h-8 min-w-0 flex-1 font-mono text-[11px]")} />
      <button
        type="button"
        aria-label="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-muted hover:text-text"
      >
        {copied ? <Check className="size-3.5 text-new" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
