import { getStats, getRecentFeed, getSavedQuickAccess } from "@/lib/data/home";
import { StatCard } from "@/components/StatCard";
import { FeedRow } from "@/components/FeedRow";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stats, feed, quickAccess] = await Promise.all([getStats(), getRecentFeed(20), getSavedQuickAccess(8)]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Open" value={stats.openCount} />
        <StatCard label="Saved" value={stats.savedCount} />
        <StatCard label="Due within 7 days" value={stats.dueSoonCount} tone="urgent" />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">Saved</h2>
        {quickAccess.length === 0 ? (
          <EmptyState title="Nothing saved yet" description="Save a posting, design team, or club to pin it here." />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {quickAccess.map((item) => (
              <a
                key={item.savedId}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-56 shrink-0 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
              >
                <p className="truncate text-sm font-medium text-text">{item.title}</p>
                <p className="truncate text-xs text-muted">{item.subtitle}</p>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">Recent</h2>
        {feed.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Add a co-op posting, or check out the Design Teams and Clubs tabs to get started."
          />
        ) : (
          <div className="space-y-3">
            {feed.map((item) => (
              <FeedRow
                key={`${item.kind}-${item.id}`}
                kind={item.kind}
                id={item.id}
                title={item.title}
                subtitle={item.subtitle}
                url={item.url}
                deadline={item.deadline}
                status={item.status}
                isNew={item.isNew}
                saved={item.saved}
                timeLabel={item.feedAt}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
