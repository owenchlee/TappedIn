import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquare, List } from "lucide-react";
import { listApplications, listTermsInUse } from "@/lib/data/applications";
import { ApplicationBoard } from "@/components/applications/ApplicationBoard";
import { ApplicationTable } from "@/components/applications/ApplicationTable";
import { LogApplicationButton } from "@/components/applications/LogApplicationButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkTabs, withParams } from "@/components/ui/LinkTabs";
import { SearchBox } from "@/components/SearchBox";
import { SAVED_CATEGORIES, type SavedCategory } from "@/lib/types";
import { nextTerm, termForDate, termLabel, termSortKey } from "@/lib/terms";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<SavedCategory | "all", string> = {
  all: "All",
  coop: "Co-op",
  design_team: "Design teams",
  club: "Clubs",
  hackathon: "Hackathons",
};

export default async function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const category = SAVED_CATEGORIES.includes(str(sp.category) as SavedCategory) ? (str(sp.category) as SavedCategory) : "all";
  const term = str(sp.term) ?? "all";
  const view = str(sp.view) === "list" ? "list" : "board";
  const q = str(sp.q) ?? "";
  const current = { category: category === "all" ? undefined : category, term: term === "all" ? undefined : term, view: view === "board" ? undefined : view, q: q || undefined };

  const [apps, allApps, termsInUse] = await Promise.all([
    listApplications({ category, term, q }),
    listApplications(),
    listTermsInUse(),
  ]);
  const terms = [...termsInUse].sort((a, b) => termSortKey(b) - termSortKey(a));
  // Co-op recruiting for a term happens the term before it.
  const defaultTerm = nextTerm(termForDate(new Date()));

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Every application in one pipeline — drag cards between stages, or change the stage from the pill."
        actions={<LogApplicationButton defaultTerm={defaultTerm} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <LinkTabs
          items={(["all", ...SAVED_CATEGORIES] as const).map((c) => ({
            href: withParams("/applications", current, { category: c === "all" ? undefined : c }),
            label: CATEGORY_LABELS[c],
            active: category === c,
            count: allApps.filter((a) => c === "all" || a.category === c).length,
          }))}
        />
        {terms.length > 0 && (
          <LinkTabs
            items={[
              { href: withParams("/applications", current, { term: undefined }), label: "Any term", active: term === "all" },
              ...terms.map((t) => ({ href: withParams("/applications", current, { term: t }), label: termLabel(t), active: term === t })),
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <SearchBox placeholder="Filter…" />
          <LinkTabs
            items={[
              { href: withParams("/applications", current, { view: undefined }), label: <KanbanSquare className="size-3.5" />, active: view === "board" },
              { href: withParams("/applications", current, { view: "list" }), label: <List className="size-3.5" />, active: view === "list" },
            ]}
          />
        </div>
      </div>

      {allApps.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="No applications yet"
          description="Bookmark a job, design team, club or hackathon to start tracking it — or log a WaterlooWorks application directly."
          action={
            <Link href="/jobs" className="text-sm font-medium text-accent hover:underline">
              Browse jobs →
            </Link>
          }
        />
      ) : apps.length === 0 ? (
        <EmptyState title="Nothing matches these filters" />
      ) : view === "board" ? (
        <ApplicationBoard apps={apps} />
      ) : (
        <ApplicationTable apps={apps} />
      )}
    </div>
  );
}
