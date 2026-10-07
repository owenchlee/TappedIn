import type { Metadata } from "next";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { PRIVATE_DIR, listJobs } from "@/lib/autoapply/job";
import { applyFolder, queueOrder } from "@/lib/autoapply/queue";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApplyQueue, type NightSummary } from "@/components/autoapply/ApplyQueue";

export const metadata: Metadata = { title: "Apply queue" };
export const dynamic = "force-dynamic";

/** The latest nightly report (private/nightly/<date>.json), if any. */
function lastNight(): NightSummary | null {
  const dir = path.join(PRIVATE_DIR, "nightly");
  if (!existsSync(dir)) return null;
  const latest = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
  if (!latest) return null;
  try {
    const r = JSON.parse(readFileSync(path.join(dir, latest), "utf8"));
    const results: { status: string; company: string; role: string; jobId?: string; note?: string }[] = r.results ?? [];
    return {
      batch: r.batch,
      error: r.error,
      ready: results.filter((x) => x.status === "ready").length,
      failed: results.filter((x) => x.status === "failed").map((x) => ({ company: x.company, role: x.role, jobId: x.jobId, note: x.note })),
      notes: r.notes ?? [],
    };
  } catch {
    return null;
  }
}

export default function ApplyQueuePage() {
  if (process.env.AUTO_APPLY_ENABLED !== "1") notFound();
  const jobs = listJobs();
  const queue = queueOrder(jobs);
  const today = new Date().toDateString();
  const appliedToday = jobs.filter((j) => j.batch && j.submittedAt && new Date(j.submittedAt).toDateString() === today).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Apply queue"
        description="Tailored overnight; each night's jobs join the end. For each job: open it, let Simplify fill the form, attach the files from Documents\Apply Today, submit, then hit I applied."
      />
      <ApplyQueue initial={queue} appliedToday={appliedToday} night={lastNight()} folder={applyFolder()} />
    </div>
  );
}
