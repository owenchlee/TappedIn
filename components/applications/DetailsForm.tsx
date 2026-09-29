"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateApplication } from "@/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ApplicationView } from "@/lib/data/applications";
import { CHANNEL_LABELS, CHANNELS } from "@/lib/types";
import { storageToDateInput } from "@/lib/deadline";
import { nextTerm, termForDate, termLabel, termRange, termSortKey } from "@/lib/terms";

export function DetailsForm({ app }: { app: ApplicationView }) {
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const now = termForDate(new Date());
  const options = new Set(termRange(now, 7));
  if (app.term) options.add(app.term);
  const terms = [...options].sort((a, b) => termSortKey(a) - termSortKey(b));

  return (
    <form
      className="space-y-3"
      onChange={() => {
        setDirty(true);
        setState("idle");
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateApplication(app.id, fd);
          if (result.ok) {
            setState("saved");
            setDirty(false);
            setError(null);
          } else {
            setState("error");
            setError(result.error);
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>Term</Label>
          <Select name="term" defaultValue={app.term ?? ""} className="w-full">
            <option value="">—</option>
            {terms.map((t) => (
              <option key={t} value={t}>
                {termLabel(t)}
                {t === nextTerm(now) ? " (next)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Applied via</Label>
          <Select name="channel" defaultValue={app.channel ?? ""} className="w-full">
            <option value="">—</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Deadline</Label>
          <Input name="deadline" type="date" defaultValue={app.deadline ? storageToDateInput(app.deadline) : ""} />
        </label>
        <label>
          <Label>WW ID / req #</Label>
          <Input name="refId" defaultValue={app.refId ?? ""} />
        </label>
        <label>
          <Label>Resume sent</Label>
          <Input name="resume" defaultValue={app.resume ?? ""} placeholder="software-v3" />
        </label>
        <label>
          <Label>Pay</Label>
          <Input name="pay" defaultValue={app.pay ?? ""} placeholder="$32/hr" />
        </label>
      </div>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <label>
          <Label>Next step</Label>
          <Input name="nextStep" defaultValue={app.nextStep} placeholder="Follow up with recruiter" />
        </label>
        <label>
          <Label>By</Label>
          <Input name="nextStepAt" type="date" defaultValue={app.nextStepAt ? storageToDateInput(app.nextStepAt) : ""} />
        </label>
      </div>
      {error && <p className="text-xs text-overdue">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {state === "saved" && !dirty && (
          <span className="flex items-center gap-1 text-xs text-new">
            <Check className="size-3.5" /> Saved
          </span>
        )}
        <Button type="submit" size="sm" variant={dirty ? "primary" : "secondary"} disabled={isPending || !dirty}>
          {isPending && <Loader2 className="animate-spin" />}
          Save details
        </Button>
      </div>
    </form>
  );
}
