import Link from "next/link";
import { listPostings, isNewPosting, isPossiblyClosed, type CoopSort } from "@/lib/data/coop";
import { PostingCard } from "@/components/PostingCard";
import { AddPostingForm } from "@/components/AddPostingForm";
import { SortSelect } from "@/components/SortSelect";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function CoopPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; showClosed?: string }>;
}) {
  const params = await searchParams;
  const sort: CoopSort = params.sort === "deadline" ? "deadline" : "recent";
  const showClosed = params.showClosed === "1";

  const postings = await listPostings({ sort, showClosed });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Co-op</h1>
        <div className="flex items-center gap-3">
          <SortSelect
            paramName="sort"
            value={sort}
            label="Sort"
            options={[
              { value: "recent", label: "Recently added" },
              { value: "deadline", label: "Deadline" },
            ]}
          />
          <Link
            href={`/coop?sort=${sort}&showClosed=${showClosed ? "0" : "1"}`}
            className="text-xs text-muted hover:text-text hover:underline"
          >
            {showClosed ? "Hide closed" : "Show closed"}
          </Link>
          <Link href="/sources" className="text-xs text-muted hover:text-text hover:underline">
            Sources
          </Link>
        </div>
      </div>

      <AddPostingForm />

      {postings.length === 0 ? (
        <EmptyState
          title="No postings yet"
          description="Add one manually above, or wait for the daily fetcher to pull from your configured company sources."
        />
      ) : (
        <div className="space-y-3">
          {postings.map((posting) => (
            <PostingCard
              key={posting.id}
              posting={posting}
              isNew={isNewPosting(posting)}
              isPossiblyClosed={isPossiblyClosed(posting)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
