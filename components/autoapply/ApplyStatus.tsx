"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Circle, Download, ExternalLink, FileText, Loader2, Minus, Send, X } from "lucide-react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/PageHeader";
import { markAutoApplySubmitted, rebaseAutoApply, requestCoverLetter } from "@/actions/apply";
import type { Job, StepName, StepState } from "@/lib/autoapply/job";
import { BASE_BADGE, RESUME_BASES, RESUME_BASE_LABELS } from "@/lib/autoapply/base";

const STEP_LABELS: Record<StepName, string> = {
  open: "Read the posting",
  tailor: "Tailor your resume (LaTeX, one page)",
  cover_letter: "Cover letter (when the posting asks for one)",
};

function StepIcon({ state }: { state: StepState }) {
  if (state === "running") return <Loader2 className="size-4 animate-spin text-accent" />;
  if (state === "done") return <Check className="size-4 text-emerald-500" />;
  if (state === "skipped") return <Minus className="size-4 text-muted-2" />;
  if (state === "failed") return <X className="size-4 text-overdue" />;
  return <Circle className="size-4 text-muted-2" />;
}

const STATUS_BADGE: Record<Job["status"], { label: string; variant: "accent" | "emerald" | "overdue" | "muted" }> = {
  running: { label: "Working", variant: "accent" },
  ready: { label: "Ready", variant: "emerald" },
  failed: { label: "Needs attention", variant: "overdue" },
  closed: { label: "Done", variant: "muted" },
};

export function ApplyStatus({ initial }: { initial: Job }) {
  const [job, setJob] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const overleafForm = useRef<HTMLFormElement>(null);
  const overleafSnip = useRef<HTMLTextAreaElement>(null);

  // Poll while the runner works; it writes job.json as each step finishes.
  useEffect(() => {
    if (job.status !== "running") return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/apply/${job.id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setJob(await res.json());
      else setJob((j) => ({ ...j })); // keep the loop going through a transient failure
    }, 1500);
    return () => clearTimeout(t);
  }, [job]);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setActionError(null);
      try {
        await fn();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    });

  const openInOverleaf = async () => {
    const tex = await fetch(`/api/apply/${job.id}/files/resume.tex`).then((r) => (r.ok ? r.text() : null));
    if (!tex || !overleafSnip.current || !overleafForm.current) return setActionError("Couldn't load the tailored .tex");
    overleafSnip.current.value = tex;
    overleafForm.current.submit();
  };

  const resumeReady = job.steps.tailor.state === "done";
  const base = job.resumeBase ?? "software";
  const coverReady = Boolean(job.coverLetter?.needed) && job.steps.cover_letter.state !== "running" && job.steps.cover_letter.state !== "pending";
  const badge = STATUS_BADGE[job.status];
  const file = (name: string) => `/api/apply/${job.id}/files/${name}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text">{job.company}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {job.submittedAt && <Badge variant="emerald">Submitted</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{job.role}</p>
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
            Open the posting <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!job.submittedAt && job.status !== "running" && resumeReady && (
            <Button size="sm" variant="primary" disabled={isPending} onClick={() => run(async () => {
              await markAutoApplySubmitted(job.id);
              setJob((j) => ({ ...j, submittedAt: new Date().toISOString() }));
            })}>
              <Send /> I applied
            </Button>
          )}
          {job.submittedAt && job.applicationId && (
            <Link href={`/applications/${job.applicationId}`} className="text-xs font-medium text-accent hover:underline">
              View in Applications
            </Link>
          )}
        </div>
      </div>

      {actionError && <p className="rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue">{actionError}</p>}
      {job.error && <p className="rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue">{job.error}</p>}
      {job.warnings?.map((w) => (
        <p key={w} className="rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue">
          {w}. Read the posting before you apply.
        </p>
      ))}
      {job.status === "ready" && !job.submittedAt && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Download the PDFs below and attach them when you apply. Then hit &ldquo;I applied&rdquo; so it shows up in Applications.
        </p>
      )}

      <Card className="space-y-2.5">
        {(Object.keys(STEP_LABELS) as StepName[]).filter((s) => job.steps[s]).map((s) => (
          <div key={s} className="flex items-start gap-2.5">
            <span className="mt-0.5"><StepIcon state={job.steps[s].state} /></span>
            <div className="min-w-0">
              <p className={clsx("text-sm", job.steps[s].state === "pending" ? "text-muted-2" : "text-text")}>{STEP_LABELS[s]}</p>
              {job.steps[s].detail && <p className="text-xs text-muted">{job.steps[s].detail}</p>}
            </div>
          </div>
        ))}
      </Card>

      {(resumeReady || coverReady) && (
        <section>
          <SectionTitle>Documents</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {resumeReady && (
              <Card className="space-y-2">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text">
                  <FileText className="size-4" /> Resume
                  <Badge variant={BASE_BADGE[base]}>{RESUME_BASE_LABELS[base]} base</Badge>
                </p>
                <p className="text-xs text-muted">{job.baseReason ?? `Tailored from your ${RESUME_BASE_LABELS[base].toLowerCase()} resume.`}</p>
                {job.baseCheck && !job.baseCheck.agrees && job.baseCheck.titleSuggests && (
                  <p className="rounded-md bg-amber/12 px-2 py-1.5 text-xs text-amber">
                    The job title looks like a {RESUME_BASE_LABELS[job.baseCheck.titleSuggests].toLowerCase()} role, but this used your{" "}
                    {RESUME_BASE_LABELS[base].toLowerCase()} resume. Check it&apos;s the right one.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" href={`${file("resume.pdf")}?download`}><Download className="size-3" /> Download PDF</a>
                  <a className="text-xs font-medium text-accent hover:underline" href={file("resume.pdf")} target="_blank" rel="noreferrer">View</a>
                  <a className="text-xs font-medium text-accent hover:underline" href={`${file("resume.tex")}?download`}>Download .tex</a>
                  <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={openInOverleaf}>Open in Overleaf</button>
                </div>
                {job.status !== "running" && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    Redo from:
                    {RESUME_BASES.filter((b) => b !== base).map((b) => (
                      <button key={b} type="button" disabled={isPending} className="font-medium text-accent hover:underline disabled:opacity-50" onClick={() => run(async () => {
                        await rebaseAutoApply(job.id, b);
                        setJob((j) => ({ ...j, status: "running" }));
                      })}>
                        {RESUME_BASE_LABELS[b].toLowerCase()} resume
                      </button>
                    ))}
                  </p>
                )}
              </Card>
            )}
            <Card className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-text"><FileText className="size-4" /> Cover letter</p>
              <p className="text-xs text-muted">
                {job.coverLetter ? job.coverLetter.reason : "Deciding once the posting is read."}
                {job.coverLetter?.needed && job.coverLetter.humanized === false && " The /humanizer skill didn't run on it, so read it carefully."}
              </p>
              <div className="flex flex-wrap gap-2">
                {coverReady && job.steps.cover_letter.state === "done" && (
                  <>
                    <a className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" href={`${file("cover-letter.pdf")}?download`}><Download className="size-3" /> Download PDF</a>
                    <a className="text-xs font-medium text-accent hover:underline" href={file("cover-letter.pdf")} target="_blank" rel="noreferrer">View</a>
                    <a className="text-xs font-medium text-accent hover:underline" href={file("cover-letter.txt")} target="_blank" rel="noreferrer">Plain text</a>
                  </>
                )}
                {job.coverLetter && !job.coverLetter.needed && job.status !== "running" && (
                  <button type="button" disabled={isPending} className="text-xs font-medium text-accent hover:underline" onClick={() => run(async () => {
                    await requestCoverLetter(job.id);
                    setJob((j) => ({ ...j, status: "running" }));
                  })}>
                    Write one
                  </button>
                )}
              </div>
            </Card>
          </div>
        </section>
      )}

      {job.tailorNotes && (
        <section>
          <SectionTitle>What changed on the resume</SectionTitle>
          <Card>
            <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-muted">{job.tailorNotes}</pre>
          </Card>
        </section>
      )}

      {/* Overleaf's documented "open a snippet" API: POSTing LaTeX to /docs creates a new project. */}
      <form ref={overleafForm} action="https://www.overleaf.com/docs" method="post" target="_blank" className="hidden">
        <textarea ref={overleafSnip} name="snip" readOnly />
        <input type="hidden" name="snip_name" value={`Resume - ${job.company}`} />
      </form>
    </div>
  );
}
