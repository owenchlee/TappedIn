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

  return (
    <li
      className={clsx(
        "group relative flex gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-surface-2/50 sm:gap-4",
        possiblyClosed && "opacity-70",
      )}
    >
      <CompanyLogo name={job.company} url={job.url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm leading-snug font-medium text-text hover:text-accent">
              {job.role}
            </a>
            <p className="mt-0.5 truncate text-xs text-muted">
              <span className="font-medium text-text/80">{job.company}</span>
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
                  aria-label="Save for later"
                  onClick={() =>
                    startTransition(async () => {
                      setTracked({ id: "pending", status: "interested" });
                      await toggleSave("coop", job.id);
                    })
                  }
                  className="flex size-8 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-3 hover:text-text"
                >
                  <Bookmark className="size-4" />
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
                  className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted ring-1 ring-border ring-inset hover:bg-surface-3 hover:text-text sm:flex"
                >
                  <Send className="size-3.5" />
                  Applied
                </button>
              </>
            )}
            {(!tracked || tracked.status === "interested") && <ApplyButton kind="coop" id={job.id} />}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open posting"
              className="flex size-8 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-3 hover:text-text"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {isNew && <Badge variant="new">New</Badge>}
          {job.terms.map((t) => (
            <Badge key={t} variant="accent">
              {termShortLabel(t)}
            </Badge>
          ))}
          {job.category && job.category !== "other" && <Badge>{JOB_CATEGORY_LABELS[job.category as JobCategory]}</Badge>}
          {job.region && job.region !== "canada" && <Badge>{REGION_LABELS[job.region as Region]}</Badge>}
          <DeadlineBadge deadline={job.deadline} />
          {sourceCount > 1 && (
            <Badge title="Listed by several sources — shown once">
              <Layers className="size-3" />
              {sourceCount} sources
            </Badge>
          )}
          <span className="ml-1 text-[11px] text-muted-2">
            {job.origin === "manual" ? "added by you" : (job.source?.name ?? "")} · {relativeTime(job.postedAt && job.postedAt < job.firstSeenAt ? job.postedAt : job.firstSeenAt)}
          </span>
        </div>
        {possiblyClosed && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
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
