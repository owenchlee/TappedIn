import { listSavedItems, type SavedSort } from "@/lib/data/saved";
import { SavedItemCard } from "@/components/SavedItemCard";
import { SortSelect } from "@/components/SortSelect";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const params = await searchParams;
  const sort: SavedSort = params.sort === "deadline" || params.sort === "status" ? params.sort : "recent";

  const items = await listSavedItems(sort);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Saved</h1>
        <SortSelect
          paramName="sort"
          value={sort}
          label="Sort"
          options={[
            { value: "recent", label: "Recently updated" },
            { value: "deadline", label: "Deadline" },
            { value: "status", label: "Status" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save a co-op posting, design team, or club from its tab to track it here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <SavedItemCard key={item.savedId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
