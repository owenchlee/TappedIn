"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarRange, ExternalLink, MapPin } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { StatusPill } from "@/components/StatusPill";
import { SaveButton } from "@/components/SaveButton";
import { NotesEditor } from "@/components/NotesEditor";
import { CheckNowButton } from "@/components/CheckNowButton";
import { ApplyButton } from "@/components/autoapply/ApplyButton";
import { urgencyOf, storageToDateInput, formatDate, isPastDate } from "@/lib/deadline";
import { relativeTime } from "@/lib/format";
import { ORG_STATUSES } from "@/lib/types";
import type { SavedCategory } from "@/lib/types";
import { setOrgStatus, setOrgDeadline } from "@/actions/orgs";
import type { OrgView } from "@/lib/data/orgs";

export function OrgCard({ org, tags, category }: { org: OrgView; tags: string[]; category: SavedCategory }) {
  const [isPending, startTransition] = useTransition();
  const [editingDeadline, setEditingDeadline] = useState(false);
  const urgency = urgencyOf(org.deadline);
  const eventPast = org.eventStart ? isPastDate(org.eventEnd ?? org.eventStart) : false;

  return (
    <Card urgency={urgency} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <CompanyLogo name={org.name} url={org.url} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <a href={org.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-semibold text-text hover:text-accent">
              {org.name}
            </a>
            {!org.managed && <Badge>No longer listed</Badge>}
          </div>
          {org.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-2">
              <MapPin className="size-3" />
              {org.location}
            </p>
          )}
        </div>
        {org.saved ? (
          <Link href={`/applications/${org.saved.id}`}>
            <StatusPill value={org.saved.status} category={category} />
          </Link>
        ) : (
          <SaveButton category={category} itemId={org.id} initialSaved={false} />
        )}
      </div>

      {org.description && <p className="line-clamp-3 text-sm text-muted">{org.description}</p>}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {org.kind !== "hackathon" && (
          <StatusPill
            value={org.applicationStatus}
            options={ORG_STATUSES}
            disabled={isPending}
            onChange={(next) => startTransition(() => setOrgStatus(org.id, next))}
          />
        )}
        {org.eventStart && (
          <Badge variant={eventPast ? "muted" : "sky"}>
            <CalendarRange className="size-3" />
            {eventPast ? "Happened " : ""}
            {formatDate(org.eventStart)}
            {org.eventEnd && storageToDateInput(org.eventEnd) !== storageToDateInput(org.eventStart) ? `–${formatDate(org.eventEnd)}` : ""}
          </Badge>
        )}
        <DeadlineBadge deadline={org.deadline} />
        {org.signal && !org.signalSeenAt && (
          <Badge variant="accent" title={org.signalAt ? `Spotted ${relativeTime(org.signalAt)}` : undefined}>
            {org.signal}
          </Badge>
        )}
        {!editingDeadline ? (
          <button type="button" onClick={() => setEditingDeadline(true)} className="text-xs text-muted-2 hover:text-text">
            {org.deadline ? "Change deadline" : "+ Deadline"}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              defaultValue={org.deadline ? storageToDateInput(org.deadline) : ""}
              className="h-7 w-auto"
              onChange={(e) => {
                const value = e.target.value || null;
                startTransition(() => setOrgDeadline(org.id, value));
                setEditingDeadline(false);
              }}
            />
            <Button size="xs" variant="ghost" onClick={() => setEditingDeadline(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-muted-2">{org.lastCheckedAt ? `Checked ${relativeTime(org.lastCheckedAt)}` : "Never checked"}</span>
        <div className="flex items-center gap-1.5">
          {org.applyUrl && <ApplyButton kind="org" id={org.id} />}
          {org.applyUrl && (
            <a href={org.applyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              Apply
              <ExternalLink className="size-3" />
            </a>
          )}
          <CheckNowButton id={org.id} url={org.applyUrl ?? org.url} />
        </div>
      </div>

      <NotesEditor kind="org" id={org.id} initialNotes={org.notes} />
    </Card>
  );
}
