"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { clsx } from "clsx";
import { Bookmark, Check, ExternalLink, Layers, Send } from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { ApplyButton } from "@/components/autoapply/ApplyButton";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/StatusPill";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { FitReasons, FitScore } from "@/components/jobs/FitSummary";
import { HARD_FLAGS } from "@/lib/fit/requirements";
import { toggleSave } from "@/actions/saved";
import { trackPosting } from "@/actions/applications";
import { resolveDisappeared } from "@/actions/coop";
import { relativeTime } from "@/lib/format";
import { termShortLabel } from "@/lib/terms";
import { JOB_CATEGORY_LABELS, REGION_LABELS, type JobCategory, type Region } from "@/lib/types";
import type { JobRow as JobRowData } from "@/lib/data/jobs";

export function JobRow({ job, isNew }: { job: JobRowData; isNew: boolean }) {
  const [tracked, setTracked] = useOptimistic<{ id: string; status: string } | null>(job.saved);
  const [isPending, startTransition] = useTransition();
  const sourceCount = 1 + new Set(job.duplicates.map((d) => d.sourceKey)).size;
  const possiblyClosed = job.disappearedAt != null && job.dismissedAt == null;
  const blocked = job.flags.some((f) => (HARD_FLAGS as readonly string[]).includes(f));

  return (
    <li
      className={clsx(
        "group relative flex gap-3 border-b border-border px-4 py-4 transition-colors last:border-0 hover:bg-surface-2/60 sm:gap-4 sm:px-5",
        (possiblyClosed || blocked) && "opacity-70",
      )}
    >
      <CompanyLogo name={job.company} url={job.url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-[15px] leading-snug font-semibold text-text hover:text-accent">
              {job.role}
            </a>
            <p className="mt-0.5 truncate text-sm text-muted">
              <span className="font-medium text-text/85">{job.company}</span>
              {job.location ? ` · ${job.location}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {tracked ? (
              <Link href={`/applications/${tracked.id}`} className="relative z-10">
                <StatusPill value={tracked.status} />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  title="Save for later"
                  onClick={() =>
                    startTransition(async () => {
                      setTracked({ id: "pending", status: "interested" });
                      await toggleSave("coop", job.id);
                    })
                  }
                  className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted ring-1 ring-border ring-inset transition-colors hover:bg-surface-3 hover:text-text"
                >
                  <Bookmark className="size-4" />
                  <span className="hidden sm:inline">Save</span>
                  <span className="sr-only sm:hidden">Save for later</span>
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  title="I applied"
                  onClick={() =>
                    startTransition(async () => {
                      setTracked({ id: "pending", status: "applied" });
                      await trackPosting(job.id, "applied");
                    })
                  }
                  className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted ring-1 ring-border ring-inset transition-colors hover:bg-surface-3 hover:text-text sm:flex"
                >
                  <Send className="size-4" />
                  I applied
                </button>
              </>
            )}
            {(!tracked || tracked.status === "interested") && <ApplyButton kind="coop" id={job.id} url={job.url} />}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open posting"
              title="Open posting"
              className="flex size-9 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-surface-3 hover:text-text"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {job.fitScore != null && <FitScore score={job.fitScore} reasons={job.fitReasons} />}
          {isNew && <Badge variant="new">New</Badge>}
          {job.terms.map((t) => (
            <Badge key={t} variant="accent">
              {termShortLabel(t)}
            </Badge>
          ))}
          <DeadlineBadge deadline={job.deadline} />
          <span className="ml-1 text-xs text-muted-2">
            {[
              job.category && job.category !== "other" ? JOB_CATEGORY_LABELS[job.category as JobCategory] : null,
              job.region && job.region !== "canada" ? REGION_LABELS[job.region as Region] : null,
              relativeTime(job.postedAt && job.postedAt < job.firstSeenAt ? job.postedAt : job.firstSeenAt),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {sourceCount > 1 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-2" title={`Listed by ${sourceCount} sources (${job.origin === "manual" ? "added by you" : (job.source?.name ?? "")} first). Shown once.`}>
              · <Layers className="size-3" />
              {sourceCount}
            </span>
          )}
        </div>
        <FitReasons reasons={job.fitReasons} blocked={blocked} />
        {possiblyClosed && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
            <span>Dropped off its source — possibly closed.</span>
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => startTransition(() => resolveDisappeared(job.id, "open"))}>
              <Check className="mr-0.5 inline size-3" />
              Still open
            </button>
            <button type="button" className="font-medium text-overdue hover:underline" onClick={() => startTransition(() => resolveDisappeared(job.id, "closed"))}>
              Mark closed
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
