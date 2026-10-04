"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { startAutoApplyOrg, startAutoApplyPosting } from "@/actions/apply";
import { useAutoApplyEnabled } from "@/components/autoapply/AutoApplyContext";

/**
 * Opens the posting in a new tab of the browser you're using, and tailors your resume (plus a cover
 * letter if the posting asks for one) in the background. You apply yourself, e.g. with Simplify.
 * Renders nothing unless tailoring is enabled locally.
 */
export function ApplyButton({ kind, id, url }: { kind: "coop" | "org"; id: string; url: string }) {
  const enabled = useAutoApplyEnabled();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!enabled) return null;

  return (
    <button
      type="button"
      disabled={isPending}
      title={error ?? "Open the posting and tailor your resume (and a cover letter if it asks for one)"}
      onClick={() => {
        // Opened during the click itself so the browser doesn't treat it as a popup.
        window.open(url, "_blank", "noopener");
        startTransition(async () => {
          setError(null);
          try {
            const jobId = kind === "coop" ? await startAutoApplyPosting(id) : await startAutoApplyOrg(id);
            router.push(`/apply/${jobId}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't start tailoring");
          }
        });
      }}
      className="relative z-10 flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-accent ring-1 ring-accent/40 ring-inset transition-colors hover:bg-accent/10 disabled:opacity-60 data-[error]:text-overdue data-[error]:ring-overdue/40"
      data-error={error ? "" : undefined}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
      {error ? "Failed" : "Tailor"}
    </button>
  );
}
