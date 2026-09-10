import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SourceActions } from "@/components/SourceActions";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await prisma.companySource.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Sources</h1>
        <p className="text-sm text-muted">
          The co-op fetcher runs daily against these public company career pages. Edit{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">data/company-sources.json</code> to add or
          remove companies.
        </p>
      </div>

      {sources.length === 0 ? (
        <EmptyState title="No sources configured" description="Add one to data/company-sources.json and redeploy." />
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <Card key={source.key} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <a
                      href={source.careerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-text hover:underline"
                    >
                      {source.name}
                    </a>
                    <Badge variant="muted">{source.adapter}</Badge>
                    {!source.enabled && <Badge variant="muted">Disabled</Badge>}
                    {source.lastError && <Badge variant="overdue">Last run failed</Badge>}
                  </div>
                  <p className="text-xs text-muted">
                    {source.lastOkAt ? `Last successful run ${relativeTime(source.lastOkAt)}` : "Never run successfully"}
                    {" · "}
                    {source.lastFetchedCount} postings on last fetch
                  </p>
                  {source.lastError && <p className="text-xs text-overdue">{source.lastError}</p>}
                </div>
                <SourceActions sourceKey={source.key} enabled={source.enabled} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
