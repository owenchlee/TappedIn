import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { Briefcase, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { listJobs, listJobTerms, parseJobFilters } from "@/lib/data/jobs";
import { jobsSeenAt } from "@/lib/data/nav";
import { JobRow } from "@/components/jobs/JobRow";
import { MarkJobsSeen } from "@/components/jobs/MarkJobsSeen";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { withParams } from "@/components/ui/LinkTabs";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchBox } from "@/components/SearchBox";
import { buttonClasses } from "@/components/ui/Button";
import { JOB_CATEGORIES, JOB_CATEGORY_LABELS } from "@/lib/types";
import { termShortLabel } from "@/lib/terms";
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
  const [{ items, total, newCount, blockedCount, pages }, terms, lastRun] = await Promise.all([
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
    blocked: str("blocked"),
    sort: str("sort"),
  };
  const href = (changes: Record<string, string | undefined>) => withParams("/jobs", current, { page: undefined, ...changes });

  const filtersSet = Boolean(current.q || current.region || current.term || current.category || current.new || current.sort);

  return (
    <div>
      <MarkJobsSeen />
      <PageHeader
        title="Jobs"
        description={
          <>
            Every internship and co-op we could find, each listed once, best matches for you first.
            {lastRun?.lastRunAt && <span className="text-muted-2"> Updated {relativeTime(lastRun.lastRunAt)}.</span>}
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBox placeholder="Search company, role or city" className="lg:w-80" />
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <Link
            href={href({ new: f.onlyNew ? undefined : "1" })}
            scroll={false}
            aria-pressed={f.onlyNew}
            className={clsx(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
              f.onlyNew ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-text shadow-card hover:border-border-strong",
            )}
          >
            <Sparkles className="size-4" />
            New
            <span className={clsx("tabular-nums", f.onlyNew ? "opacity-80" : "text-muted-2")}>{newCount}</span>
          </Link>
          <FilterSelect
            label="Region"
            options={REGION_PRESETS.map((r) => ({ href: href({ region: r.value }), label: r.label, active: (current.region ?? undefined) === r.value }))}
          />
          {terms.length > 0 && (
            <FilterSelect
              label="Term"
              options={[
                { href: href({ term: undefined }), label: "Any term", active: !f.term },
                ...terms.slice(0, 6).map((t) => ({ href: href({ term: t }), label: termShortLabel(t), active: f.term === t })),
              ]}
            />
          )}
          <FilterSelect
            label="Role"
            options={[
              { href: href({ category: undefined }), label: "All roles", active: !f.category },
              ...JOB_CATEGORIES.filter((c) => c !== "other").map((c) => ({ href: href({ category: c }), label: JOB_CATEGORY_LABELS[c], active: f.category === c })),
            ]}
          />
          <FilterSelect
            label="Sort"
            options={[
              { href: href({ sort: undefined }), label: "Best match", active: f.sort === "best" },
              { href: href({ sort: "new" }), label: "Newest first", active: f.sort === "new" },
              { href: href({ sort: "deadline" }), label: "Deadline first", active: f.sort === "deadline" },
            ]}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm">
        <span className="text-muted tabular-nums">
          {total.toLocaleString()} {total === 1 ? "job" : "jobs"}
        </span>
        {filtersSet && (
          <Link href="/jobs" scroll={false} className="font-medium text-accent hover:text-accent-hover">
            Clear filters
          </Link>
        )}
        {f.showBlocked ? (
          <Link href={href({ blocked: undefined })} scroll={false} className="text-muted hover:text-text">
            Hide ones I can&apos;t apply to
          </Link>
        ) : (
          blockedCount > 0 && (
            <span className="text-muted-2">
              <span className="tabular-nums">{blockedCount.toLocaleString()}</span> hidden: wrong grad year, upper years, PhD or U.S. citizens only.{" "}
              <Link href={href({ blocked: "1" })} scroll={false} className="text-muted underline-offset-2 hover:text-text hover:underline">
                Show them
              </Link>
            </span>
          )
        )}
        <span className="ml-auto flex gap-4">
          <Link href={href({ tracked: f.hideTracked ? undefined : "hide" })} scroll={false} className="text-muted hover:text-text">
            {f.hideTracked ? "Show ones I track" : "Hide ones I track"}
          </Link>
          <Link href={href({ closed: f.showClosed ? undefined : "1" })} scroll={false} className="text-muted hover:text-text">
            {f.showClosed ? "Hide closed" : "Show closed"}
          </Link>
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={total === 0 && !f.q ? "No jobs match these filters" : "Nothing found"}
          description="Try a different term or region, or clear the filters."
          action={
            filtersSet ? (
              <Link href="/jobs" className={buttonClasses("secondary", "md")}>
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {items.map((job) => (
            <JobRow key={job.id} job={job} isNew={job.firstSeenAt > seenAt} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2">
          {f.page > 1 && (
            <Link href={withParams("/jobs", current, { page: String(f.page - 1) })} className={buttonClasses("secondary", "md")}>
              <ChevronLeft />
              Previous
            </Link>
          )}
          <span className="px-3 text-sm text-muted tabular-nums">
            {f.page} / {pages}
          </span>
          {f.page < pages && (
            <Link href={withParams("/jobs", current, { page: String(f.page + 1) })} className={buttonClasses("secondary", "md")}>
              Next
              <ChevronRight />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
