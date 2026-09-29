"use client";

import { useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import { ArrowRight, CalendarCheck2, CircleDot, Gift, Loader2, Mic, MessageSquare, Plus, Send, Trash2 } from "lucide-react";
import { addEvent, deleteEvent } from "@/actions/applications";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { EVENT_LABELS, EVENT_TYPES, stageLabel, type EventType } from "@/lib/types";

type Event = { id: string; type: string; title: string; at: Date; fromStatus: string | null; toStatus: string | null; notes: string };

const ICONS: Record<string, typeof Mic> = {
  stage: CircleDot,
  oa: CalendarCheck2,
  interview: Mic,
  offer: Gift,
  follow_up: Send,
  note: MessageSquare,
};

const TONE: Record<string, string> = {
  stage: "bg-surface-3 text-muted",
  oa: "bg-violet/15 text-violet",
  interview: "bg-amber/15 text-amber",
  offer: "bg-emerald/15 text-emerald",
  follow_up: "bg-sky/15 text-sky",
  note: "bg-surface-3 text-muted",
};

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });

function isFuture(at: Date) {
  return at.getTime() > Date.now();
}

function isMidday(at: Date) {
  // Date-only entries are stored at 12:00 UTC — don't print a fake time for them.
  return at.getUTCHours() === 12 && at.getUTCMinutes() === 0;
}

function describe(e: Event): string {
  if (e.type === "stage") {
    if (!e.fromStatus) return `Started tracking as ${stageLabel(e.toStatus ?? "interested")}`;
    return `${stageLabel(e.fromStatus)} → ${stageLabel(e.toStatus ?? "")}`;
  }
  return e.title || EVENT_LABELS[e.type as EventType] || e.type;
}

function torontoNowInput(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

export function Timeline({ savedId, events, createdAt }: { savedId: string; events: Event[]; createdAt: Date }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const sorted = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-xs text-muted">Log OAs, interviews, offers and follow-ups — they show up on your calendar.</p>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus />
            Add event
          </Button>
        )}
      </div>

      {adding && (
        <form
          ref={formRef}
          className="space-y-3 border-b border-border bg-surface-2/50 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await addEvent(savedId, fd);
              if (!result.ok) return setError(result.error);
              formRef.current?.reset();
              setAdding(false);
            });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr_200px]">
            <label>
              <Label>Type</Label>
              <Select name="type" defaultValue="interview" className="w-full">
                {EVENT_TYPES.filter((t) => t !== "stage").map((t) => (
                  <option key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <Label>Title</Label>
              <Input name="title" placeholder="Technical interview with the platform team" />
            </label>
            <label>
              <Label>When</Label>
              <Input name="at" type="datetime-local" required defaultValue={torontoNowInput()} />
            </label>
          </div>
          <Textarea name="notes" placeholder="Notes (optional)" rows={2} />
          {error && <p className="text-xs text-overdue">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" variant="primary" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Save event
            </Button>
          </div>
        </form>
      )}

      <ol className="relative px-4 py-4">
        <span className="absolute top-6 bottom-6 left-[31px] w-px bg-border" aria-hidden />
        {sorted.map((e) => {
          const Icon = ICONS[e.type] ?? CircleDot;
          const upcoming = e.type !== "stage" && isFuture(e.at);
          return (
            <li key={e.id} className="group relative flex gap-3 py-2">
              <span className={clsx("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", TONE[e.type] ?? TONE.note)}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium text-text">
                    {e.type === "stage" && e.fromStatus ? (
                      <span className="inline-flex items-center gap-1">
                        {stageLabel(e.fromStatus)}
                        <ArrowRight className="size-3 text-muted-2" />
                        {stageLabel(e.toStatus ?? "")}
                      </span>
                    ) : (
                      describe(e)
                    )}
                  </p>
                  {upcoming && <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent uppercase">Upcoming</span>}
                </div>
                <p className="text-xs text-muted-2">
                  {fmt.format(e.at)}
                  {!isMidday(e.at) && e.type !== "stage" ? ` · ${fmtTime.format(e.at)}` : ""}
                </p>
                {e.notes && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{e.notes}</p>}
              </div>
              {e.type !== "stage" && (
                <button
                  type="button"
                  aria-label="Delete event"
                  onClick={() => startTransition(() => deleteEvent(e.id))}
                  className="mt-1 flex size-7 items-center justify-center rounded-md text-muted-2 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-overdue focus:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
        {sorted.length === 0 && <li className="py-2 text-sm text-muted-2">Tracking since {fmt.format(createdAt)}.</li>}
      </ol>
    </Card>
  );
}
