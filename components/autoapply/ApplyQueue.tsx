"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, Check, ClipboardCopy, ExternalLink, FileText, FolderOpen, Loader2, PartyPopper, Send, SkipForward, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/PageHeader";
import { FitScore } from "@/components/jobs/FitSummary";
import { finishPrefill, markAutoApplySubmitted, openApplyFolder, prefillStatus, skipQueuedJob, stageApplyFiles, startPrefill } from "@/actions/apply";
import type { PrefillView } from "@/lib/autoapply/prefill";
import { isThirdParty } from "@/lib/autoapply/source";
import { RESUME_BASE_LABELS } from "@/lib/autoapply/base";
import type { RankedJob } from "@/lib/autoapply/rankedQueue";
import type { Roi } from "@/lib/autoapply/roi";
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

/**
 * One job at a time: open it, attach the staged files, submit, "I applied", next. Keys: O, A, S, C.
 * Or "Process top 10" first: Claude opens and fills those in Chrome tabs, and each card just says to review and submit.
 */
export function ApplyQueue({
  initial,
  appliedToday,
  night,
  folder,
  prefill: initialPrefill,
  prefillRunning,
}: {
  initial: RankedJob[];
  appliedToday: number;
  night: NightSummary | null;
  folder: string;
  prefill: Record<string, PrefillView | null>;
  prefillRunning: boolean;
}) {
  const [queue, setQueue] = useState(initial);
  const [done, setDone] = useState(appliedToday);
  const [opened, setOpened] = useState<string | null>(null);
  const [staged, setStaged] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const job = queue.at(0);
  const [prefill, setPrefill] = useState(initialPrefill);
  const [processing, setProcessing] = useState(prefillRunning);
  const pf = job ? prefill[job.id] : null;
  const toProcess = queue.filter((j) => !prefill[j.id]).length;
  const toFinish = queue.filter((j) => prefill[j.id]?.state === "needs_you").length;

  // While a batch is filling, check on it every few seconds; when the last tab is done, say so.
  useEffect(() => {
    if (!processing) return;
    const ids = initial.map((j) => j.id);
    const timer = setInterval(async () => {
      const s = await prefillStatus(ids).catch(() => null);
      if (!s) return;
      setPrefill(s.jobs);
      // A posting found to be closed leaves the queue.
      setQueue((q) => q.filter((j) => !s.jobs[j.id]?.closed));
      if (s.running) return;
      setProcessing(false);
      if (s.error) {
        setError(s.error);
        return;
      }
      const states = Object.values(s.jobs).filter((p) => p?.finishedAt && Date.now() - Date.parse(p.finishedAt) < 3_600_000);
      const ready = states.filter((p) => p?.state === "ready").length;
      const msg = `${ready} of ${states.length} applications are filled in. Review each Chrome tab and submit.`;
      setFlash(msg);
      if ("Notification" in window && Notification.permission === "granted") new Notification("Applications ready to review", { body: msg });
    }, 5000);
    return () => clearInterval(timer);
  }, [processing, initial]);

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

  const processTop = useCallback(() => {
    // Ask inside the click, so the browser shows the prompt.
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    run(async () => {
      const ids = await startPrefill(10);
      setPrefill((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, { state: "queued" as const }])) }));
      setProcessing(true);
    });
  }, [run]);

  // After Owen has made the accounts by hand in the open tabs, Claude carries on from there.
  const finishUp = useCallback(() => {
    run(async () => {
      const ids = await finishPrefill();
      setPrefill((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, { ...p[id], state: "queued" as const, note: "Waiting to finish" }])) }));
      setProcessing(true);
    });
  }, [run]);

  // The employer's own posting; a job-board link (csjobs.ca etc.) only when that hasn't been found.
  const applyUrl = (pf?.applyUrl ?? job?.applyUrl ?? job?.url) || "";
  const boardOnly = Boolean(job && isThirdParty(applyUrl));
  // Its Chrome tab is already open and filled (or waiting on Owen for something): just review and submit.
  const prefilled = pf?.state === "ready" || pf?.state === "needs_you";

  const next = useCallback(() => {
    setQueue((q) => q.slice(1));
    setOpened(null);
    setStaged([]);
  }, []);

  const open = useCallback(() => {
    if (!job) return;
    // Synchronously, inside the click, or the popup blocker eats it.
    window.open(applyUrl, "_blank", "noopener");
    setOpened(job.id);
  }, [job, applyUrl]);

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

      {toFinish > 0 && !processing && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber/12 text-amber">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-text">{toFinish} waiting on you in Chrome</p>
            <p className="text-muted">Made the accounts / signed in? Claude picks up each open tab where it stopped: autofill, resume, leftover fields. Nothing gets submitted.</p>
          </div>
          <Button disabled={isPending} onClick={finishUp}>
            <Sparkles /> Finish {toFinish}
          </Button>
        </Card>
      )}

      {(toProcess > 0 || processing) && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            {processing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            {processing ? (
              <>
                <p className="font-medium text-text">Filling applications in Chrome</p>
                <p className="text-muted">
                  {Object.values(prefill).filter((p) => p && !["queued", "running"].includes(p.state)).length} done of{" "}
                  {Object.values(prefill).filter(Boolean).length}. You&apos;ll get a notification when they all are. Nothing gets submitted.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-text">Process the next {Math.min(10, toProcess)}</p>
                <p className="text-muted">Opens each in its own Chrome tab, runs Simplify and attaches the tailored resume, all at once. You review and submit.</p>
              </>
            )}
          </div>
          {!processing && (
            <Button disabled={isPending} onClick={processTop}>
              <Sparkles /> Process top {Math.min(10, toProcess)}
            </Button>
          )}
        </Card>
      )}

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
          <p className="max-w-sm text-sm text-muted">Tonight at 2 AM the next batch of 10 is tailored.</p>
        </Card>
      ) : (
        <Card className="space-y-5 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <RoiBadge roi={job.roi} />
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
            <RoiParts roi={job.roi} />
          </div>

          {pf && <PrefillLine p={pf} />}
          {boardOnly && !pf && (
            <p className="flex items-start gap-2 rounded-lg bg-amber/12 px-3 py-2 text-sm text-amber">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> This link is a job board, not {job.company}&apos;s own posting. Apply on {job.company}&apos;s careers site, not through the board.
            </p>
          )}
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
            <Step n={1} active={opened !== job.id && !prefilled}>
              <Button variant={opened === job.id || prefilled ? "secondary" : "primary"} disabled={isPending} onClick={open}>
                <ExternalLink /> {prefilled ? "Open it again" : "Open the posting"} <Kbd>O</Kbd>
              </Button>
            </Step>
            <Step n={2} active={opened === job.id && !prefilled}>
              <div className="space-y-2 text-sm">
                <p className="text-text">{prefilled ? "Claude attached these. If the tab shows something else, swap in:" : "Let Simplify fill the form. Swap its resume for the tailored one:"}</p>
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
            <Step n={3} active={opened === job.id || prefilled}>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={opened === job.id || prefilled ? "primary" : "secondary"} disabled={isPending} onClick={applied}>
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
                  <RoiBadge roi={j.roi} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{j.company}</p>
                    <p className="truncate text-xs text-muted">{j.role}</p>
                  </div>
                  {prefill[j.id] && <PrefillPill p={prefill[j.id]!} />}
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

function roiTier(score: number): { label: string; className: string } {
  if (score >= 70) return { label: "High ROI", className: "bg-emerald/12 text-emerald ring-emerald/25" };
  if (score >= 50) return { label: "Decent ROI", className: "bg-accent/12 text-accent ring-accent/25" };
  if (score >= 30) return { label: "Low ROI", className: "bg-surface-2 text-muted ring-border" };
  return { label: "Long shot", className: "bg-overdue/10 text-overdue ring-overdue/20" };
}

/** The odds this application turns into an interview, 0-100 (lib/autoapply/roi.ts). */
function RoiBadge({ roi }: { roi: Roi }) {
  const tier = roiTier(roi.score);
  return (
    <span
      title={`${tier.label} (${roi.score}/100)\n${roi.parts.map((p) => (p.max ? `${p.label}: ${Math.round(p.points)}/${p.max}` : `${p.label}: x0.4`)).join("\n")}`}
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${tier.className}`}
    >
      <span className="font-medium opacity-70">ROI</span>
      {roi.score}
    </span>
  );
}

function RoiParts({ roi }: { roi: Roi }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Why this ROI">
      {roi.parts.map((p) => (
        <li key={p.label} className={p.max && p.points / p.max < 0.35 ? "text-overdue" : undefined}>
          {p.label} <span className="tabular-nums opacity-70">{p.max ? `${Math.round(p.points)}/${p.max}` : "x0.4"}</span>
        </li>
      ))}
    </ul>
  );
}

const PREFILL_LOOK: Record<PrefillView["state"], { label: string; className: string }> = {
  queued: { label: "Waiting", className: "bg-surface-2 text-muted" },
  running: { label: "Filling", className: "bg-accent/12 text-accent" },
  ready: { label: "Ready to submit", className: "bg-emerald/12 text-emerald" },
  needs_you: { label: "Needs you", className: "bg-amber/12 text-amber" },
  failed: { label: "Couldn't fill", className: "bg-overdue/10 text-overdue" },
};

function PrefillPill({ p }: { p: PrefillView }) {
  const look = PREFILL_LOOK[p.state];
  return (
    <span title={p.note} className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium ${look.className}`}>
      {p.state === "running" && <Loader2 className="size-3 animate-spin" />}
      {look.label}
    </span>
  );
}

/** What Claude did with this job's Chrome tab. */
function PrefillLine({ p }: { p: PrefillView }) {
  const look = PREFILL_LOOK[p.state];
  const text =
    p.state === "ready"
      ? "Filled in its own Chrome tab with the tailored resume attached. Review it there and submit."
      : p.state === "needs_you"
        ? "Open in Chrome, but it needs you"
        : p.state === "failed"
          ? "Claude couldn't fill this one"
          : p.state === "running"
            ? "Claude is filling this in Chrome"
            : "Waiting its turn in Chrome";
  return (
    <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${look.className}`}>
      {p.state === "running" ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : <Sparkles className="mt-0.5 size-4 shrink-0" />}
      <span>
        {text}
        {p.note && p.state !== "ready" ? `: ${p.note}` : p.note ? ` ${p.note}` : ""}
      </span>
    </p>
  );
}
