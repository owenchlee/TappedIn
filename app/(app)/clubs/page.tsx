import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { listOrgs } from "@/lib/data/orgs";
import { OrgListPage } from "@/components/OrgListPage";

export const metadata: Metadata = { title: "Clubs" };
export const dynamic = "force-dynamic";

export default async function ClubsPage({ searchParams }: PageProps<"/clubs">) {
  const showPast = (await searchParams).showPast === "1";
  const { orgs, hiddenCount } = await listOrgs("club", { includePast: showPast });

  return (
    <OrgListPage
      title="Clubs"
      description={
        <>
          Clubs worth joining, from <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">data/clubs.json</code>. Bookmark one to track your
          application alongside everything else.
        </>
      }
      orgs={orgs}
      hiddenCount={hiddenCount}
      showPast={showPast}
      basePath="/clubs"
      category="club"
      icon={UsersRound}
      emptyHint="Add entries to data/clubs.json and redeploy."
    />
  );
}
