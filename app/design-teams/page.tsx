import { listOrgs, parseTags } from "@/lib/data/orgs";
import { OrgCard } from "@/components/OrgCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function DesignTeamsPage() {
  const orgs = await listOrgs("design_team");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Design Teams</h1>
        <p className="text-sm text-muted">
          Curated list, edited by hand in <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">data/design-teams.json</code>.
          No automatic fetching — use &ldquo;Check now&rdquo; to open a team&apos;s site and eyeball it yourself.
        </p>
      </div>

      {orgs.length === 0 ? (
        <EmptyState title="No design teams yet" description="Add entries to data/design-teams.json and redeploy." />
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} tags={parseTags(org.tagsJson)} category="design_team" />
          ))}
        </div>
      )}
    </div>
  );
}
