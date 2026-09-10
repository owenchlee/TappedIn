"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { StatusPill } from "@/components/StatusPill";
import { SaveButton } from "@/components/SaveButton";
import { NotesEditor } from "@/components/NotesEditor";
import { CheckNowButton } from "@/components/CheckNowButton";
import { urgencyOf, storageToDateInput } from "@/lib/deadline";
import { relativeTime } from "@/lib/format";
import { ORG_STATUSES } from "@/lib/types";
import type { SavedCategory } from "@/lib/types";
import { setOrgStatus, setOrgDeadline } from "@/actions/orgs";
import type { OrgView } from "@/lib/data/orgs";

export function OrgCard({ org, tags, category }: { org: OrgView; tags: string[]; category: SavedCategory }) {
  const [isPending, startTransition] = useTransition();
  const [editingDeadline, setEditingDeadline] = useState(false);
  const urgency = urgencyOf(org.deadline);

  return (
    <Card urgency={urgency} className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={org.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-semibold text-text hover:underline"
            >
              {org.name}
            </a>
            {!org.managed && <Badge variant="muted">No longer in seed list</Badge>}
          </div>
          {org.description && <p className="text-sm text-muted">{org.description}</p>}
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <SaveButton category={category} itemId={org.id} initialSaved={Boolean(org.saved)} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill
          value={org.applicationStatus}
          options={ORG_STATUSES}
          disabled={isPending}
          onChange={(next) => startTransition(() => setOrgStatus(org.id, next))}
        />
        <DeadlineBadge deadline={org.deadline} />
        {!editingDeadline && (
          <button
            type="button"
            onClick={() => setEditingDeadline(true)}
            className="text-xs text-muted hover:text-text hover:underline"
          >
            {org.deadline ? "Change deadline" : "+ Set deadline"}
          </button>
        )}
        {editingDeadline && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              defaultValue={org.deadline ? storageToDateInput(org.deadline) : ""}
              className="w-auto py-1"
              onChange={(e) => {
                const value = e.target.value || null;
                startTransition(() => setOrgDeadline(org.id, value));
                setEditingDeadline(false);
              }}
            />
            <Button size="sm" variant="ghost" onClick={() => setEditingDeadline(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-2">
          {org.lastCheckedAt ? `Checked ${relativeTime(org.lastCheckedAt)}` : "Never checked"}
        </span>
        <CheckNowButton id={org.id} url={org.applyUrl ?? org.url} />
      </div>

      <NotesEditor kind="org" id={org.id} initialNotes={org.notes} />
    </Card>
  );
}
