"use client";

import { useActionState } from "react";
import { clsx } from "clsx";
import { saveJobPreferences } from "@/actions/jobPrefs";
import { Button } from "@/components/ui/Button";
import type { JobPrefs } from "@/lib/fit/prefs";
import { JOB_CATEGORIES, JOB_CATEGORY_LABELS } from "@/lib/types";
import { termLabel } from "@/lib/terms";

function Chip({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span
        className={clsx(
          "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors",
          "bg-surface text-muted ring-border hover:text-text",
          "peer-checked:bg-accent-soft peer-checked:text-accent peer-checked:ring-accent/40",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
        )}
      >
        {label}
      </span>
    </label>
  );
}

export function JobPrefsForm({ prefs, terms }: { prefs: JobPrefs; terms: string[] }) {
  const [state, action, pending] = useActionState(saveJobPreferences, null);
  const termOptions = [...new Set([...terms, ...prefs.targetTerms])];

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Terms you&apos;re applying for</legend>
        <div className="flex flex-wrap gap-2">
          {termOptions.map((t) => (
            <Chip key={t} name="targetTerms" value={t} label={termLabel(t)} checked={prefs.targetTerms.includes(t)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Kinds of roles</legend>
        <div className="flex flex-wrap gap-2">
          {JOB_CATEGORIES.filter((c) => c !== "other").map((c) => (
            <Chip key={c} name="categories" value={c} label={JOB_CATEGORY_LABELS[c]} checked={prefs.categories.includes(c)} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-2">Your first pick ({JOB_CATEGORY_LABELS[prefs.categories[0] ?? "software"]}) counts a little more than the rest.</p>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Graduation year</span>
          <input
            type="number"
            name="gradYear"
            min={2020}
            max={2040}
            defaultValue={prefs.gradYear}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm tabular-nums focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Skills from your resume</span>
          <textarea
            name="skills"
            rows={2}
            defaultValue={prefs.skills.join(", ")}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block text-xs text-muted-2">Comma-separated, written the way postings write them (C++, Next.js). Jobs asking for these rank higher.</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Re-scoring jobs…" : "Save and re-score"}
        </Button>
        <p role="status" className={clsx("text-sm", state && !state.ok ? "text-overdue" : "text-muted")}>
          {state ? (state.ok ? `Saved. Re-scored ${state.rescored.toLocaleString()} jobs.` : state.error) : null}
        </p>
      </div>
    </form>
  );
}
