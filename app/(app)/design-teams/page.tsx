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
      description="UW student design teams. Save one to track it, and check back when recruiting opens."
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
