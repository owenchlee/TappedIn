"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { bulkAdd, quickAdd } from "@/actions/applications";
import { CHANNEL_LABELS, CHANNELS, STAGE_LABELS } from "@/lib/types";
import { termLabel, termRange } from "@/lib/terms";

const START_STAGES = ["interested", "applied", "oa", "interview", "offer"] as const;

export function LogApplicationButton({ defaultTerm, label = "Log application" }: { defaultTerm: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const terms = termRange(defaultTerm, 6);

  function close() {
    setOpen(false);
    setError(null);
    setNotice(null);
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Log an application"
        description="For anything not auto-fetched — WaterlooWorks, referrals, a posting you found yourself."
      >
        <div className="mb-4 grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
          {(["single", "bulk"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx("h-7 rounded-md text-xs font-medium", mode === m ? "bg-surface text-text shadow-card" : "text-muted")}
            >
              {m === "single" ? "One application" : "Paste a batch"}
            </button>
          ))}
        </div>

        <form
          ref={formRef}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setNotice(null);
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              if (mode === "single") {
                const result = await quickAdd(fd);
                if (!result.ok) return setError(result.error);
                close();
                if (result.data) router.push(`/applications/${result.data.id}`);
              } else {
                const result = await bulkAdd(fd);
                if (!result.ok) return setError(result.error);
                const { added, skipped } = result.data!;
                if (skipped.length === 0) close();
                else setNotice(`Added ${added}. Couldn't read ${skipped.length} line(s): ${skipped.slice(0, 3).join(" / ")}`);
                formRef.current?.reset();
              }
            });
          }}
        >
          {mode === "single" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <Label>Company</Label>
                  <Input name="company" required placeholder="Shopify" autoFocus />
                </label>
                <label>
                  <Label>Role</Label>
                  <Input name="role" required placeholder="Software Developer Co-op" />
                </label>
              </div>
              <label className="block">
                <Label>Link (optional)</Label>
                <Input name="url" type="url" placeholder="https://… — leave blank for WaterlooWorks" />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label>
                  <Label>Stage</Label>
                  <Select name="status" defaultValue="applied" className="w-full">
                    {START_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <Label>Term</Label>
                  <Select name="term" defaultValue={defaultTerm} className="w-full">
                    {terms.map((t) => (
                      <option key={t} value={t}>
                        {termLabel(t)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <Label>Via</Label>
                  <Select name="channel" defaultValue="waterlooworks" className="w-full">
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <Label>Deadline</Label>
                  <Input name="deadline" type="date" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <Label>Location</Label>
                  <Input name="location" placeholder="Toronto, ON" />
                </label>
                <label>
                  <Label>WW job ID / req #</Label>
                  <Input name="refId" placeholder="123456" />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="block">
                <Label>One per line — Company | Role | optional link</Label>
                <Textarea
                  name="lines"
                  required
                  rows={7}
                  className="font-mono text-xs"
                  placeholder={"Shopify | Software Developer Co-op\nRBC | Data Analyst Intern | https://jobs.rbc.com/…\nTesla - Firmware Engineering Intern"}
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label>
                  <Label>Stage</Label>
                  <Select name="status" defaultValue="applied" className="w-full">
                    {START_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <Label>Term</Label>
                  <Select name="term" defaultValue={defaultTerm} className="w-full">
                    {terms.map((t) => (
                      <option key={t} value={t}>
                        {termLabel(t)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <Label>Via</Label>
                  <Select name="channel" defaultValue="waterlooworks" className="w-full">
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </>
          )}

          {error && <p className="text-xs text-overdue">{error}</p>}
          {notice && <p className="text-xs text-urgent">{notice}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : mode === "bulk" ? <ClipboardList /> : <Plus />}
              {mode === "bulk" ? "Add all" : "Add"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
