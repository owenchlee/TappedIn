import type { Metadata } from "next";
import { CircleAlert, CircleCheck, CircleDashed, Radar } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { SourceActions, RefreshAllButton } from "@/components/SourceActions";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [sources, counts, mlh, daily] = await Promise.all([
    prisma.companySource.findMany({ orderBy: { key: "asc" } }),
    prisma.coopPosting.groupBy({ by: ["sourceKey"], where: { status: { not: "closed" } }, _count: true }),
    prisma.jobState.findUnique({ where: { key: "mlh-hackathons" } }),
    prisma.jobState.findUnique({ where: { key: "daily-refresh" } }),
  ]);
  const openBySource = new Map(counts.map((c) => [c.sourceKey, c._count]));
  const failing = sources.filter((s) => s.enabled && s.lastError).length;

  return (
    <div>
      <PageHeader
        title="Sources"
        description={
          <>
            Where jobs come from. Everything refreshes once a day{daily?.lastRunAt ? ` (last run ${relativeTime(daily.lastRunAt)})` : ""}; add companies in{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">data/company-sources.json</code>.
          </>
        }
        actions={<RefreshAllButton />}
      />

      {failing > 0 && (
        <Card className="mb-6 flex items-center gap-3 border-overdue/30 bg-overdue/5">
          <CircleAlert className="size-5 text-overdue" />
          <p className="text-sm">
            {failing} {failing === 1 ? "source is" : "sources are"} failing. Postings from {failing === 1 ? "it" : "them"} stay as they were until the next good run.
          </p>
        </Card>
      )}

      {sources.length === 0 ? (
        <EmptyState icon={Radar} title="No sources configured" description="Add one to data/company-sources.json and redeploy." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sources.map((source) => {
            const Icon = !source.enabled ? CircleDashed : source.lastError ? CircleAlert : CircleCheck;
            return (
              <Card key={source.key} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${!source.enabled ? "text-muted-2" : source.lastError ? "text-overdue" : "text-new"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <a href={source.careerUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-accent">
                        {source.name}
                      </a>
                      <Badge>{source.adapter}</Badge>
                      {!source.enabled && <Badge>Off</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {source.lastOkAt ? `OK ${relativeTime(source.lastOkAt)}` : "Never run successfully"} · {source.lastFetchedCount} matched last run ·{" "}
                      {openBySource.get(source.key) ?? 0} open
                    </p>
                    {source.lastError && <p className="mt-1 line-clamp-2 text-xs text-overdue">{source.lastError}</p>}
                  </div>
                </div>
                <div className="mt-auto flex justify-end">
                  <SourceActions sourceKey={source.key} enabled={source.enabled} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <section className="mt-8">
        <SectionTitle>Hackathons</SectionTitle>
        <Card className="flex items-center gap-3">
          {mlh?.lastError ? <CircleAlert className="size-4 text-overdue" /> : <CircleCheck className="size-4 text-new" />}
          <div className="text-sm">
            <p className="font-medium">Major League Hacking season calendar</p>
            <p className="text-xs text-muted">
              {mlh?.lastOkAt ? `Imported ${relativeTime(mlh.lastOkAt)}` : "Not imported yet"}
              {mlh?.lastError ? ` · ${mlh.lastError}` : ""} · keeps events within driving distance, online, elsewhere in Canada, and nearby US states.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
