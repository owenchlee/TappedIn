"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { StatusPill } from "@/components/StatusPill";
import { SaveButton } from "@/components/SaveButton";
import { NotesEditor } from "@/components/NotesEditor";
import { urgencyOf } from "@/lib/deadline";
import { SAVED_STATUSES } from "@/lib/types";
import type { SavedStatus } from "@/lib/types";
import { updateSavedStatus } from "@/actions/saved";
import type { SavedItemView } from "@/lib/data/saved";

const KIND_LABEL: Record<SavedItemView["category"], string> = {
  coop: "Co-op",
  design_team: "Design team",
  club: "Club",
};

export function SavedItemCard({ item }: { item: SavedItemView }) {
  const [isPending, startTransition] = useTransition();
  const urgency = urgencyOf(item.deadline);

  return (
    <Card urgency={urgency} className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-semibold text-text hover:underline"
            >
              {item.title}
            </a>
            <Badge variant="muted">{KIND_LABEL[item.category]}</Badge>
          </div>
          <p className="truncate text-sm text-muted">{item.subtitle}</p>
        </div>
        <SaveButton category={item.category} itemId={item.entityId} initialSaved />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill
          value={item.status}
          options={SAVED_STATUSES}
          disabled={isPending}
          onChange={(next) => startTransition(() => updateSavedStatus(item.savedId, next as SavedStatus))}
        />
        <DeadlineBadge deadline={item.deadline} />
      </div>

      <NotesEditor kind={item.entityKind} id={item.entityId} initialNotes={item.notes} />
    </Card>
  );
}
