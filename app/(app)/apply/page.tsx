import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listJobs, type Job } from "@/lib/autoapply/job";
import { BASE_BADGE, RESUME_BASE_LABELS } from "@/lib/autoapply/base";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplyFromUrl } from "@/components/autoapply/ApplyFromUrl";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Resumes" };
export const dynamic = "force-dynamic";

const STATUS: Record<Job["status"], { label: string; variant: "accent" | "emerald" | "overdue" | "muted" }> = {
  running: { label: "Working", variant: "accent" },
  ready: { label: "Ready to review", variant: "emerald" },
  failed: { label: "Needs attention", variant: "overdue" },
  closed: { label: "Done", variant: "muted" },
};

export default function ResumesPage() {
  if (process.env.AUTO_APPLY_ENABLED !== "1") notFound();
  const jobs = listJobs();

  return (
    <div>
      <PageHeader
        title="Resumes & cover letters"
        description="Hit Tailor on any job: the posting opens in a new tab, and your Overleaf resume is tailored to it (plus a cover letter when the posting asks for one) while you look. Apply however you like; Simplify can fill the form."
      />

      <section className="mb-8">
        <SectionTitle>Tailor for a link</SectionTitle>
        <Card>
          <ApplyFromUrl />
        </Card>
      </section>

      <section>
        <SectionTitle>Runs</SectionTitle>
        {jobs.length === 0 ? (
          <EmptyState title="Nothing tailored yet" description="Hit Tailor on any job, design team, club or hackathon, or paste a link above." />
        ) : (
          <Card className="divide-y divide-border p-0">
            {jobs.map((j) => (
              <Link key={j.id} href={`/apply/${j.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{j.company}</p>
                  <p className="truncate text-xs text-muted">
                    {j.role} · {relativeTime(new Date(j.createdAt))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {j.resumeBase && (
                    <Badge variant={j.baseCheck?.agrees === false ? "amber" : BASE_BADGE[j.resumeBase]}>
                      {RESUME_BASE_LABELS[j.resumeBase]}
                      {j.baseCheck?.agrees === false && " (check)"}
                    </Badge>
                  )}
                  {j.submittedAt && <Badge variant="emerald">Submitted</Badge>}
                  <Badge variant={STATUS[j.status].variant}>{STATUS[j.status].label}</Badge>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
