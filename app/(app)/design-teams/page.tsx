import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import { listOrgs } from "@/lib/data/orgs";
import { OrgListPage } from "@/components/OrgListPage";

export const metadata: Metadata = { title: "Design teams" };
export const dynamic = "force-dynamic";

export default async function DesignTeamsPage({ searchParams }: PageProps<"/design-teams">) {
  const showPast = (await searchParams).showPast === "1";
  const { orgs, hiddenCount } = await listOrgs("design_team", { includePast: showPast });

  return (
    <OrgListPage
      title="Design teams"
      description={
        <>
          UW student design teams, from <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">data/design-teams.json</code>. Set the status and
          deadline when recruiting opens — &ldquo;Check now&rdquo; opens the team&apos;s site and stamps when you last looked.
        </>
      }
      orgs={orgs}
      hiddenCount={hiddenCount}
      showPast={showPast}
      basePath="/design-teams"
      category="design_team"
      icon={Cpu}
      emptyHint="Add entries to data/design-teams.json and redeploy."
    />
  );
}
