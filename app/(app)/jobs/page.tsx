import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { listJobs, listJobTerms, parseJobFilters } from "@/lib/data/jobs";
import { jobsSeenAt } from "@/lib/data/nav";
import { JobRow } from "@/components/jobs/JobRow";
import { MarkJobsSeen } from "@/components/jobs/MarkJobsSeen";
import { LogApplicationButton } from "@/components/applications/LogApplicationButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkTabs, withParams } from "@/components/ui/LinkTabs";
import { SearchBox } from "@/components/SearchBox";
import { buttonClasses } from "@/components/ui/Button";
import { JOB_CATEGORIES, JOB_CATEGORY_LABELS } from "@/lib/types";
import { nextTerm, termForDate, termShortLabel } from "@/lib/terms";
import { prisma } from "@/lib/db";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const REGION_PRESETS = [
  { value: undefined, label: "Canada + remote" },
  { value: "canada", label: "Canada" },
  { value: "us", label: "US" },
  { value: "all", label: "Everywhere" },
] as const;

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const f = parseJobFilters(sp);
  const seenAt = await jobsSeenAt();
  const [{ items, total, newCount, pages }, terms, lastRun] = await Promise.all([
    listJobs(f, seenAt),
    listJobTerms(),
    prisma.jobState.findUnique({ where: { key: "daily-refresh" } }),
  ]);

  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const current: Record<string, string | undefined> = {
    q: str("q"),
    region: str("region"),
    term: str("term"),
    category: str("category"),
    new: str("new"),
    tracked: str("tracked"),
    closed: str("closed"),
    sort: str("sort"),
  };
  const href = (changes: Record<string, string | undefined>) => withParams("/jobs", current, { page: undefined, ...changes });

  return (
    <div>
      <MarkJobsSeen />
      <PageHeader
        title="Jobs"
        description={
          <>
            Internships and co-ops from curated lists and company boards, deduplicated — every job appears once.
            {lastRun?.lastRunAt && <span className="text-muted-2"> Updated {relativeTime(lastRun.lastRunAt)}.</span>}
          </>
        }
        actions={<LogApplicationButton defaultTerm={nextTerm(termForDate(new Date()))} label="Add from WaterlooWorks" />}
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox placeholder="Company, role, city…" className="w-full sm:w-auto" />
          <LinkTabs
            items={REGION_PRESETS.map((r) => ({
              href: href({ region: r.value }),
              label: r.label,
              active: (current.region ?? undefined) === r.value,
            }))}
          />
          <Link
            href={href({ new: f.onlyNew ? undefined : "1" })}
            scroll={false}
            className={buttonClasses(f.onlyNew ? "primary" : "secondary", "sm", "h-8")}
          >
            <Sparkles />
            {newCount} new
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {terms.length > 0 && (
            <LinkTabs
              items={[
                { href: href({ term: undefined }), label: "Any term", active: !f.term },
                ...terms.slice(0, 6).map((t) => ({ href: href({ term: t }), label: termShortLabel(t), active: f.term === t })),
              ]}
            />
          )}
          <LinkTabs
            items={[
              { href: href({ category: undefined }), label: "All roles", active: !f.category },
              ...JOB_CATEGORIES.filter((c) => c !== "other").map((c) => ({
                href: href({ category: c }),
                label: JOB_CATEGORY_LABELS[c],
                active: f.category === c,
              })),
            ]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LinkTabs
              items={[
                { href: href({ sort: undefined }), label: "Newest", active: f.sort === "new" },
                { href: href({ sort: "deadline" }), label: "Deadline", active: f.sort === "deadline" },
              ]}
            />
            <Link href={href({ tracked: f.hideTracked ? undefined : "hide" })} scroll={false} className="text-xs text-muted hover:text-text">
              {f.hideTracked ? "Show tracked" : "Hide tracked"}
            </Link>
            <Link href={href({ closed: f.showClosed ? undefined : "1" })} scroll={false} className="text-xs text-muted hover:text-text">
              {f.showClosed ? "Hide closed" : "Show closed"}
            </Link>
          </div>
        </div>
      </div>

      <p className="mb-2 text-xs text-muted-2 tabular-nums">
        {total.toLocaleString()} {total === 1 ? "job" : "jobs"}
        {pages > 1 ? ` · page ${f.page} of ${pages}` : ""}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={total === 0 && !f.q ? "No jobs match these filters" : "Nothing found"}
          description="Try a different term or region — or check Sources if you expected fresh postings."
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          {items.map((job) => (
            <JobRow key={job.id} job={job} isNew={job.firstSeenAt > seenAt} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2">
          {f.page > 1 && (
            <Link href={withParams("/jobs", current, { page: String(f.page - 1) })} className={buttonClasses("secondary", "sm")}>
              <ChevronLeft />
              Previous
            </Link>
          )}
          <span className="px-2 text-xs text-muted tabular-nums">
            {f.page} / {pages}
          </span>
          {f.page < pages && (
            <Link href={withParams("/jobs", current, { page: String(f.page + 1) })} className={buttonClasses("secondary", "sm")}>
              Next
              <ChevronRight />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
