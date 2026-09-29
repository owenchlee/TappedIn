"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { startAutoApplyOrg, startAutoApplyPosting } from "@/actions/apply";
import { useAutoApplyEnabled } from "@/components/autoapply/AutoApplyContext";

/**
 * Opens the posting in Chrome, tailors the resume, writes a cover letter if one is required, and
 * fills the form, then leaves Submit to Owen. Renders nothing unless auto-apply is enabled locally.
 */
export function ApplyButton({ kind, id }: { kind: "coop" | "org"; id: string }) {
  const enabled = useAutoApplyEnabled();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!enabled) return null;

  return (
    <button
      type="button"
      disabled={isPending}
      title={error ?? "Auto-apply: open it, tailor your resume, fill the form (you submit)"}
      onClick={() =>
        startTransition(async () => {
          setError(null);
          try {
            const jobId = kind === "coop" ? await startAutoApplyPosting(id) : await startAutoApplyOrg(id);
            router.push(`/apply/${jobId}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't start auto-apply");
          }
        })
      }
      className="relative z-10 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-accent ring-1 ring-accent/40 ring-inset hover:bg-accent/10 disabled:opacity-60 data-[error]:text-overdue data-[error]:ring-overdue/40"
      data-error={error ? "" : undefined}
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
      {error ? "Failed" : "Auto-apply"}
    </button>
  );
}
