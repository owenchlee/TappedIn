"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, Check, ClipboardCopy, ExternalLink, FileText, FolderOpen, PartyPopper, Send, SkipForward } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/PageHeader";
import { FitScore } from "@/components/jobs/FitSummary";
import { markAutoApplySubmitted, openApplyFolder, skipQueuedJob, stageApplyFiles } from "@/actions/apply";
import { RESUME_BASE_LABELS } from "@/lib/autoapply/base";
import type { Job } from "@/lib/autoapply/job";
import { ResumeScoreBadge } from "@/components/autoapply/ResumeScore";

export type NightSummary = {
  batch: string;
  error?: string;
  ready: number;
  failed: { company: string; role: string; jobId?: string; note?: string }[];
  notes: string[];
};

const DAY = 86_400_000;

function closes(deadline: string | null | undefined): { label: string; urgent: boolean } | null {
  if (!deadline) return null;
  const days = Math.ceil((Date.parse(deadline) - Date.now()) / DAY);
  const label = days <= 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Closes in ${days} days`;
  return { label, urgent: days <= 3 };
}

/** One job at a time: open it, attach the staged files, submit, "I applied", next. Keys: O, A, S, C. */
export function ApplyQueue({ initial, appliedToday, night, folder }: { initial: Job[]; appliedToday: number; night: NightSummary | null; folder: string }) {
  const [queue, setQueue] = useState(initial);
  const [done, setDone] = useState(appliedToday);
  const [opened, setOpened] = useState<string | null>(null);
  const [staged, setStaged] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const job = queue.at(0);

  const run = useCallback(
    (fn: () => Promise<void>) =>
      startTransition(async () => {
        setError(null);
        try {
          await fn();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }),
    [],
  );

  const next = useCallback(() => {
    setQueue((q) => q.slice(1));
    setOpened(null);
    setStaged([]);
  }, []);

  const open = useCallback(() => {
    if (!job) return;
    // Synchronously, inside the click, or the popup blocker eats it.
    window.open(job.url, "_blank", "noopener");
    setOpened(job.id);
  }, [job]);

  // Whoever is at the front owns Apply Today, so the folder never shows a previous job's files.
  const jobId = job?.id;
  useEffect(() => {
    if (!jobId) return;
    setStaged([]);
    run(async () => setStaged(await stageApplyFiles(jobId)));
  }, [jobId, run]);

  const applied = useCallback(() => {
    if (!job) return;
    run(async () => {
      await markAutoApplySubmitted(job.id);
      setDone((n) => n + 1);
      next();
    });
  }, [job, run, next]);

  const skip = useCallback(() => {
    if (!job) return;
    run(async () => {
      await skipQueuedJob(job.id);
      next();
    });
  }, [job, run, next]);

  const copyLetter = useCallback(() => {
    if (!job?.coverLetter?.needed) return;
    run(async () => {
      const text = await fetch(`/api/apply/${job.id}/files/cover-letter.txt`).then((r) => (r.ok ? r.text() : Promise.reject(new Error("No cover letter text"))));
      await navigator.clipboard.writeText(text.trim());
      setFlash("Cover letter copied. Paste it into the form's text box.");
      setTimeout(() => setFlash(null), 3000);
    });
  }, [job, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isPending) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "o") open();
      else if (k === "a") applied();
      else if (k === "s") skip();
      else if (k === "c") copyLetter();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, applied, skip, copyLetter, isPending]);

  const total = queue.length + done;
  const due = closes(job?.deadline);
  const hasLetter = Boolean(job?.coverLetter?.needed && job.steps.cover_letter.state !== "skipped");

  return (
    <div className="space-y-6">
      {night && <NightLine night={night} />}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-text">{queue.length === 0 ? "All done" : `${queue.length} to go`}</span>
          <span className="text-muted">{done} applied today</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>

      {error && <p className="rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue">{error}</p>}
      {flash && <p className="rounded-lg bg-emerald/10 px-3 py-2 text-sm text-emerald">{flash}</p>}

      {!job ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent"><PartyPopper className="size-5" /></span>
          <p className="font-medium text-text">{done ? `${done} applications sent today` : "Nothing waiting"}</p>
          <p className="max-w-sm text-sm text-muted">Tonight at 2 AM the next batch is tailored and the queue fills back up to 15.</p>
        </Card>
      ) : (
        <Card className="space-y-5 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {job.fitScore != null && <FitScore score={job.fitScore} reasons={[]} />}
              {due && (
                <Badge variant={due.urgent ? "urgent" : "muted"}>
                  <CalendarClock className="size-3" /> {due.label}
                </Badge>
              )}
              {hasLetter && <Badge variant="violet">Cover letter</Badge>}
              {job.resumeBase && <Badge variant="muted">{RESUME_BASE_LABELS[job.resumeBase]} resume</Badge>}
              <ResumeScoreBadge ats={job.ats} />
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text">{job.company}</h2>
            <p className="text-sm text-muted">{job.role}</p>
          </div>

          {job.warnings?.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}. Check the posting before applying, or skip it.
            </p>
          ))}
          {job.baseCheck?.agrees === false && job.baseCheck.titleSuggests && (
            <p className="rounded-lg bg-amber/12 px-3 py-2 text-sm text-amber">
              This used your {RESUME_BASE_LABELS[job.resumeBase ?? "software"].toLowerCase()} resume, but the title reads like a {RESUME_BASE_LABELS[job.baseCheck.titleSuggests].toLowerCase()} role.{" "}
              <Link href={`/apply/${job.id}`} className="font-medium underline">Redo it</Link>
            </p>
          )}
          {hasLetter && job.coverLetter?.humanized === false && (
            <p className="rounded-lg bg-amber/12 px-3 py-2 text-sm text-amber">The humanizer didn&apos;t run on this cover letter. Skim it before you send it.</p>
          )}

          <ol className="space-y-3">
            <Step n={1} active={opened !== job.id}>
              <Button variant={opened === job.id ? "secondary" : "primary"} disabled={isPending} onClick={open}>
                <ExternalLink /> Open the posting <Kbd>O</Kbd>
              </Button>
            </Step>
            <Step n={2} active={opened === job.id}>
              <div className="space-y-2 text-sm">
                <p className="text-text">Let Simplify fill the form. Swap its resume for the tailored one:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">{folder}</code>
                  <Button size="xs" variant="ghost" onClick={() => run(openApplyFolder)}><FolderOpen /> Open folder</Button>
                </div>
                <ul className="space-y-1 text-xs text-muted">
                  <li className="flex items-center gap-1.5">
                    {staged.includes("Owen_Lee_Resume.pdf") ? <Check className="size-3.5 text-emerald" /> : <FileText className="size-3.5" />}
                    Owen_Lee_Resume.pdf
                    <a className="text-accent hover:underline" href={`/api/apply/${job.id}/files/resume.pdf`} target="_blank" rel="noreferrer">view</a>
                  </li>
                  {hasLetter && (
                    <li className="flex items-center gap-1.5">
                      {staged.includes("Owen_Lee_Cover_Letter.pdf") ? <Check className="size-3.5 text-emerald" /> : <FileText className="size-3.5" />}
                      Owen_Lee_Cover_Letter.pdf
                      <a className="text-accent hover:underline" href={`/api/apply/${job.id}/files/cover-letter.pdf`} target="_blank" rel="noreferrer">view</a>
                      <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={copyLetter}>
                        <ClipboardCopy className="size-3" /> copy text <Kbd>C</Kbd>
                      </button>
                    </li>
                  )}
                </ul>
                {staged.length > 0 && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-emerald/10 px-3 py-1.5 text-xs text-emerald">
                    <Check className="size-3.5" /> Apply Today now holds the {job.company} files
                  </p>
                )}
              </div>
            </Step>
            <Step n={3} active={opened === job.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={opened === job.id ? "primary" : "secondary"} disabled={isPending} onClick={applied}>
                  <Send /> I applied, next <Kbd>A</Kbd>
                </Button>
                <Button variant="ghost" disabled={isPending} onClick={skip}>
                  <SkipForward /> Skip <Kbd>S</Kbd>
                </Button>
                <Link href={`/apply/${job.id}`} className="ml-auto text-xs text-muted hover:text-text">What changed on the resume</Link>
              </div>
            </Step>
          </ol>
        </Card>
      )}

      {queue.length > 1 && (
        <section>
          <SectionTitle>Up next</SectionTitle>
          <Card className="divide-y divide-border p-0">
            {queue.slice(1).map((j) => {
              const d = closes(j.deadline);
              return (
                <div key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                  {j.fitScore != null && <FitScore score={j.fitScore} reasons={[]} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{j.company}</p>
                    <p className="truncate text-xs text-muted">{j.role}</p>
                  </div>
                  {j.warnings?.length ? <AlertTriangle className="size-4 text-overdue" aria-label="Has a warning" /> : null}
                  {j.coverLetter?.needed && <Badge variant="violet">Letter</Badge>}
                  {d && <span className={d.urgent ? "text-xs text-urgent" : "text-xs text-muted"}>{d.label}</span>}
                </div>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}

function Step({ n, active, children }: { n: number; active: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}>{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded border border-current/25 px-1 font-sans text-[10px] leading-4 opacity-70">{children}</kbd>;
}

function NightLine({ night }: { night: NightSummary }) {
  const date = new Date(`${night.batch}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  if (night.error) {
    return <p className="rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue">The {date} nightly run failed: {night.error}</p>;
  }
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
      <p>
        Overnight ({date}): {night.ready} tailored{night.failed.length ? `, ${night.failed.length} failed` : ""}.
      </p>
      {night.notes.map((n) => <p key={n}>{n}</p>)}
      {night.failed.map((f) => (
        <p key={`${f.company}${f.role}`} className="text-xs">
          ✗ {f.jobId ? <Link href={`/apply/${f.jobId}`} className="underline">{f.company} · {f.role}</Link> : `${f.company} · ${f.role}`}
          {f.note ? `: ${f.note}` : ""}
        </p>
      ))}
    </div>
  );
}
