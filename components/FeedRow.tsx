import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { StatusPill } from "@/components/StatusPill";
import { SaveButton } from "@/components/SaveButton";
import { relativeTime } from "@/lib/format";
import { urgencyOf } from "@/lib/deadline";
import type { SavedCategory } from "@/lib/types";

const TAB_HREF: Record<SavedCategory, string> = {
  coop: "/coop",
  design_team: "/design-teams",
  club: "/clubs",
};

const KIND_LABEL: Record<SavedCategory, string> = {
  coop: "Co-op",
  design_team: "Design team",
  club: "Club",
};

export function FeedRow({
  kind,
  id,
  title,
  subtitle,
  url,
  deadline,
  status,
  isNew,
  saved,
  timeLabel,
}: {
  kind: SavedCategory;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  deadline: Date | null;
  status: string;
  isNew: boolean;
  saved: boolean;
  timeLabel: Date;
}) {
  return (
    <Card urgency={urgencyOf(deadline)} className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-semibold text-text hover:underline">
              {title}
            </a>
            {isNew && <Badge variant="new">New</Badge>}
          </div>
          <p className="truncate text-sm text-muted">{subtitle}</p>
        </div>
        <SaveButton category={kind} itemId={id} initialSaved={saved} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={TAB_HREF[kind]} className="text-xs text-muted-2 hover:text-text hover:underline">
          {KIND_LABEL[kind]}
        </Link>
        <StatusPill value={status} />
        <DeadlineBadge deadline={deadline} />
        <span className="text-xs text-muted-2">· {relativeTime(timeLabel)}</span>
      </div>
    </Card>
  );
}
