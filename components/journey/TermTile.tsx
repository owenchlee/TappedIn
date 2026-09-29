"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Briefcase, BookOpen, Coffee, Plus, Star } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CompanyLogo } from "@/components/CompanyLogo";
import { clearTerm, saveTerm, setJourneyStart, termFromApplication } from "@/actions/terms";
import { termLabel, termRange, termForDate } from "@/lib/terms";

type TermData = {
  code: string;
  kind: string;
  label: string;
  company: string;
  role: string;
  location: string;
  pay: string;
  rating: number | null;
  notes: string;
  savedItemId: string | null;
};

const KIND_STYLE = {
  study: { icon: BookOpen, label: "Study", tone: "text-sky bg-sky/12" },
  work: { icon: Briefcase, label: "Work", tone: "text-emerald bg-emerald/12" },
  off: { icon: Coffee, label: "Off", tone: "text-muted bg-surface-3" },
} as const;

export function TermTile({ code, term, isCurrent, isPast }: { code: string; term: TermData | null; isCurrent: boolean; isPast: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(term?.kind ?? "study");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const style = term ? KIND_STYLE[term.kind as keyof typeof KIND_STYLE] ?? KIND_STYLE.study : null;
  const Icon = style?.icon;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "group flex min-h-32 flex-col rounded-xl border p-3.5 text-left shadow-card transition-all hover:border-border-strong hover:shadow-pop",
          term ? "border-border bg-surface" : "border-dashed border-border-strong bg-surface/40",
          isCurrent && "ring-2 ring-accent/60",
          isPast && !term && "opacity-60",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{termLabel(code)}</span>
          {style && Icon ? (
            <span className={clsx("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", style.tone)}>
              <Icon className="size-3" />
              {term?.label || style.label}
            </span>
          ) : (
            <Plus className="size-4 text-muted-2 opacity-0 group-hover:opacity-100" />
          )}
        </div>
        {isCurrent && <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-accent uppercase">Now</span>}
        {term?.kind === "work" && term.company ? (
          <div className="mt-auto flex items-center gap-2.5 pt-3">
            <CompanyLogo name={term.company} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{term.company}</p>
              <p className="truncate text-xs text-muted">{term.role || term.location}</p>
            </div>
          </div>
        ) : term?.notes ? (
          <p className="mt-auto line-clamp-2 pt-3 text-xs text-muted">{term.notes}</p>
        ) : !term ? (
          <p className="mt-auto pt-3 text-xs text-muted-2">Not planned yet</p>
        ) : null}
        {term?.rating && (
          <div className="mt-2 flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={clsx("size-3", i < term.rating! ? "fill-amber text-amber" : "text-border-strong")} />
            ))}
          </div>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={termLabel(code)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await saveTerm(code, fd);
              if (!result.ok) return setError(result.error);
              setOpen(false);
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label>
              <Label>This term is</Label>
              <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full">
                <option value="study">A study term</option>
                <option value="work">A work term</option>
                <option value="off">Off</option>
              </Select>
            </label>
            <label>
              <Label>Label</Label>
              <Input name="label" defaultValue={term?.label} placeholder={kind === "study" ? "2A" : kind === "work" ? "Work term 3" : ""} />
            </label>
          </div>
          {kind === "work" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <Label>Company</Label>
                  <Input name="company" defaultValue={term?.company} />
                </label>
                <label>
                  <Label>Role</Label>
                  <Input name="role" defaultValue={term?.role} />
                </label>
                <label>
                  <Label>Location</Label>
                  <Input name="location" defaultValue={term?.location} />
                </label>
                <label>
                  <Label>Pay</Label>
                  <Input name="pay" defaultValue={term?.pay} placeholder="$34/hr" />
                </label>
              </div>
              <label className="block">
                <Label>How was it? (1–5)</Label>
                <Select name="rating" defaultValue={term?.rating ? String(term.rating) : ""} className="w-full">
                  <option value="">—</option>
                  {[5, 4, 3, 2, 1].map((r) => (
                    <option key={r} value={r}>
                      {"★".repeat(r)}
                    </option>
                  ))}
                </Select>
              </label>
            </>
          )}
          <label className="block">
            <Label>Notes</Label>
            <Textarea
              name="notes"
              defaultValue={term?.notes}
              rows={3}
              placeholder={kind === "study" ? "Courses, what you'd tell your past self…" : "What you worked on, what you learned, who to keep in touch with…"}
            />
          </label>
          {term?.savedItemId && (
            <Link href={`/applications/${term.savedItemId}`} className="block text-xs text-accent hover:underline">
              View the application →
            </Link>
          )}
          {error && <p className="text-xs text-overdue">{error}</p>}
          <div className="flex justify-between gap-2">
            {term ? (
              <Button
                variant="ghost"
                onClick={() =>
                  startTransition(async () => {
                    await clearTerm(code);
                    setOpen(false);
                  })
                }
              >
                Clear
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isPending}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AddOfferToJourney({ savedId }: { savedId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await termFromApplication(savedId);
            if (!result.ok) setError(result.error);
          })
        }
      >
        Add to journey
      </Button>
      {error && <span className="text-[11px] text-overdue">{error}</span>}
    </div>
  );
}

export function JourneyStartPicker({ start }: { start: string }) {
  const [, startTransition] = useTransition();
  const now = termForDate(new Date());
  const [y] = [Number(now.slice(1)) + 2000];
  // Offer start terms from four years back to a year ahead.
  const options = termRange(`F${String((y - 5) % 100).padStart(2, "0")}`, 20);
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      Starts
      <Select value={start} onChange={(e) => startTransition(() => setJourneyStart(e.target.value))}>
        {options.map((t) => (
          <option key={t} value={t}>
            {termLabel(t)}
          </option>
        ))}
      </Select>
    </label>
  );
}
