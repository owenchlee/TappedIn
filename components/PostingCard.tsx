"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { StatusPill } from "@/components/StatusPill";
import { SaveButton } from "@/components/SaveButton";
import { NotesEditor } from "@/components/NotesEditor";
import { urgencyOf } from "@/lib/deadline";
import { relativeTime, hostnameFromUrl } from "@/lib/format";
import { COOP_STATUSES } from "@/lib/types";
import { setPostingStatus, deletePosting, resolveDisappeared } from "@/actions/coop";
import type { CoopPostingView } from "@/lib/data/coop";

export function PostingCard({
  posting,
  isNew,
  isPossiblyClosed,
}: {
  posting: CoopPostingView;
  isNew: boolean;
  isPossiblyClosed: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const urgency = urgencyOf(posting.deadline);

  return (
    <Card urgency={urgency} className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={posting.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-semibold text-text hover:underline"
            >
              {posting.role}
            </a>
            {isNew && <Badge variant="new">New</Badge>}
          </div>
          <p className="truncate text-sm text-muted">
            {posting.company}
            {posting.location ? ` · ${posting.location}` : ""}
          </p>
        </div>
        <SaveButton category="coop" itemId={posting.id} initialSaved={Boolean(posting.saved)} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill
          value={posting.status}
          options={COOP_STATUSES}
          disabled={isPending}
          onChange={(next) => startTransition(() => setPostingStatus(posting.id, next))}
        />
        <DeadlineBadge deadline={posting.deadline} />
        <span className="text-xs text-muted-2">{hostnameFromUrl(posting.url)}</span>
        <span className="text-xs text-muted-2">· added {relativeTime(posting.firstSeenAt)}</span>
      </div>

      {isPossiblyClosed && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs text-muted">
          <span>
            Not seen since {posting.lastSeenAt ? relativeTime(posting.lastSeenAt) : "the last check"} — possibly
            closed.
          </span>
          <Button size="sm" variant="secondary" onClick={() => startTransition(() => resolveDisappeared(posting.id, "open"))}>
            Still open
          </Button>
          <Button size="sm" variant="danger" onClick={() => startTransition(() => resolveDisappeared(posting.id, "closed"))}>
            Confirm closed
          </Button>
        </div>
      )}

      <NotesEditor kind="coop" id={posting.id} initialNotes={posting.notes} />

      {posting.origin === "manual" && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete ${posting.company} — ${posting.role}?`)) {
                startTransition(() => deletePosting(posting.id));
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}
