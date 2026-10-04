import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { listOrgs } from "@/lib/data/orgs";
import { OrgListPage } from "@/components/OrgListPage";
import { LinkTabs, withParams } from "@/components/ui/LinkTabs";
import type { HackathonRegion } from "@/lib/types";

export const metadata: Metadata = { title: "Hackathons" };
export const dynamic = "force-dynamic";

const PRESETS: { value: string | undefined; label: string; regions: HackathonRegion[] }[] = [
  { value: undefined, label: "Driving distance + online", regions: ["nearby", "online"] },
  { value: "nearby", label: "Driving distance", regions: ["nearby"] },
  { value: "online", label: "Online", regions: ["online"] },
  { value: "all", label: "All of Canada + nearby US", regions: ["nearby", "online", "canada", "us"] },
];

export default async function HackathonsPage({ searchParams }: PageProps<"/hackathons">) {
  const sp = await searchParams;
  const showPast = sp.showPast === "1";
  const regionParam = typeof sp.region === "string" ? sp.region : undefined;
  const preset = PRESETS.find((p) => p.value === regionParam) ?? PRESETS[0];
  const { orgs, hiddenCount } = await listOrgs("hackathon", { includePast: showPast, regions: preset.regions });
  const current = { region: regionParam, showPast: showPast ? "1" : undefined };

  return (
    <OrgListPage
      title="Hackathons"
      description="Hackathons coming up near Waterloo and online, refreshed daily."
      filters={
        <LinkTabs
          items={PRESETS.map((p) => ({ href: withParams("/hackathons", current, { region: p.value }), label: p.label, active: p === preset }))}
        />
      }
      orgs={orgs}
      hiddenCount={hiddenCount}
      showPast={showPast}
      basePath={withParams("/hackathons", { region: regionParam }, {})}
      category="hackathon"
      icon={Trophy}
      emptyHint="New MLH events are pulled in daily; you can also add entries to data/hackathons.json."
    />
  );
}
