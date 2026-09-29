"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { clsx } from "clsx";
import { ArrowRight, CalendarCheck2, ChevronDown, Mic, Users } from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { StatusPill, statusDotClass } from "@/components/StatusPill";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { Badge } from "@/components/ui/Badge";
import { setStage } from "@/actions/applications";
import type { ApplicationView } from "@/lib/data/applications";
import { ACTIVE_STAGES, CLOSED_STAGES, STAGES_BY_CATEGORY, stageLabel, type SavedStatus } from "@/lib/types";
import { termShortLabel } from "@/lib/terms";
import { formatDate, isPastDate } from "@/lib/deadline";
import { relativeTime } from "@/lib/format";

const COLUMN_HINT: Partial<Record<SavedStatus, string>> = {
  interested: "Bookmarked, not applied yet",
  applied: "Waiting to hear back",
  oa: "Online assessments",
  interview: "Interviews scheduled or done",
  offer: "Decide before the deadline",
};

function whenLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}

export function ApplicationCard({
  app,
  onStage,
  draggable,
  compact,
}: {
  app: ApplicationView;
  onStage: (id: string, status: SavedStatus) => void;
  draggable?: boolean;
  compact?: boolean;
}) {
  // Due today or already overdue.
  const nextStepDue = app.nextStepAt != null && !isPastDate(new Date(), app.nextStepAt);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/application-id", app.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={clsx(
        "group relative rounded-xl border border-border bg-surface p-3 shadow-card transition-all hover:border-border-strong hover:shadow-pop",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <Link href={`/applications/${app.id}`} className="absolute inset-0 rounded-xl" aria-label={`${app.title} at ${app.company}`} />
      <div className="flex items-start gap-2.5">
        <CompanyLogo name={app.entityKind === "coop" ? app.company : app.title} url={app.url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] leading-snug font-medium text-text">{app.title}</p>
          <p className="truncate text-xs text-muted">{app.company}</p>
        </div>
      </div>
      {!compact && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {app.term && <Badge>{termShortLabel(app.term)}</Badge>}
          {app.status === "interested" && <DeadlineBadge deadline={app.deadline} />}
          {app.upcoming && (
            <Badge variant={app.upcoming.type === "interview" ? "amber" : "violet"}>
              {app.upcoming.type === "interview" ? <Mic className="size-3" /> : <CalendarCheck2 className="size-3" />}
              {whenLabel(app.upcoming.at)}
            </Badge>
          )}
          {app.contactCount > 0 && (
            <Badge>
              <Users className="size-3" />
              {app.contactCount}
            </Badge>
          )}
        </div>
      )}
      {!compact && app.nextStep && (
        <p className={clsx("mt-2 flex items-center gap-1 text-xs", nextStepDue ? "text-urgent" : "text-muted")}>
          <ArrowRight className="size-3 shrink-0" />
          <span className="truncate">
            {app.nextStep}
            {app.nextStepAt ? ` · ${formatDate(app.nextStepAt)}` : ""}
          </span>
        </p>
      )}
      <div className="relative mt-2.5 flex items-center justify-between gap-2">
        <StatusPill
          value={app.status}
          category={app.category}
          options={STAGES_BY_CATEGORY[app.category]}
          onChange={(next) => onStage(app.id, next as SavedStatus)}
        />
        <span className="text-[11px] text-muted-2">{relativeTime(app.statusChangedAt)}</span>
      </div>
    </div>
  );
}

export function ApplicationBoard({ apps }: { apps: ApplicationView[] }) {
  const [optimistic, applyMove] = useOptimistic(apps, (state, move: { id: string; status: SavedStatus }) =>
    state.map((a) => (a.id === move.id ? { ...a, status: move.status, statusChangedAt: new Date() } : a)),
  );
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  function move(id: string, status: SavedStatus) {
    startTransition(async () => {
      applyMove({ id, status });
      await setStage(id, status);
    });
  }

  const closed = optimistic.filter((a) => (CLOSED_STAGES as readonly string[]).includes(a.status));

  return (
    <div className="space-y-6">
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1000px] grid-cols-5 gap-3">
          {ACTIVE_STAGES.map((stage) => {
            const cards = optimistic.filter((a) => a.status === stage);
            return (
              <section
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(stage);
                }}
                onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/application-id");
                  if (id) move(id, stage);
                }}
                className={clsx(
                  "flex min-h-72 flex-col rounded-2xl border p-2 transition-colors",
                  dragOver === stage ? "border-accent/50 bg-accent-soft/60" : "border-border/70 bg-surface-2/50",
                )}
              >
                <header className="mb-2 px-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={clsx("size-2 rounded-full", statusDotClass(stage))} />
                    <h3 className="text-[13px] font-semibold">{stageLabel(stage)}</h3>
                    <span className="text-xs text-muted-2 tabular-nums">{cards.length}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-2">{COLUMN_HINT[stage]}</p>
                </header>
                <div className="flex flex-col gap-2">
                  {cards.map((app) => (
                    <ApplicationCard key={app.id} app={app} onStage={move} draggable />
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-2">Drop here</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {closed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowClosed((s) => !s)}
            className="mb-3 flex items-center gap-2 text-sm font-semibold text-text"
          >
            <ChevronDown className={clsx("size-4 transition-transform", !showClosed && "-rotate-90")} />
            Closed out
            <span className="text-xs font-normal text-muted-2">
              {CLOSED_STAGES.map((s) => {
                const n = closed.filter((a) => a.status === s).length;
                return n ? `${n} ${stageLabel(s).toLowerCase()}` : null;
              })
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
          {showClosed && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {closed.map((app) => (
                <ApplicationCard key={app.id} app={app} onStage={move} compact />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
