import type { LucideIcon } from "lucide-react";
import { OrgCard } from "@/components/OrgCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PastToggle } from "@/components/PastToggle";
import { parseTags, type OrgView } from "@/lib/data/orgs";
import type { SavedCategory } from "@/lib/types";

export function OrgListPage({
  title,
  description,
  orgs,
  hiddenCount,
  showPast,
  basePath,
  category,
  icon,
  filters,
  emptyHint,
}: {
  title: string;
  description: React.ReactNode;
  orgs: OrgView[];
  hiddenCount: number;
  showPast: boolean;
  basePath: string;
  category: SavedCategory;
  icon: LucideIcon;
  filters?: React.ReactNode;
  emptyHint: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} actions={<PastToggle basePath={basePath} showPast={showPast} hiddenCount={hiddenCount} />} />
      {filters && <div className="mb-5">{filters}</div>}
      {orgs.length === 0 ? (
        <EmptyState icon={icon} title={hiddenCount > 0 ? "Nothing you can apply to right now" : `No ${title.toLowerCase()} yet`} description={emptyHint} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} tags={parseTags(org.tagsJson)} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}
