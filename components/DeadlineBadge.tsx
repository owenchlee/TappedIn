import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { deadlineLabel, urgencyOf } from "@/lib/deadline";
import type { Urgency } from "@/lib/types";

const URGENCY_VARIANT: Record<Urgency, BadgeVariant> = {
  overdue: "overdue",
  today: "urgent",
  urgent: "urgent",
  soon: "muted",
  far: "muted",
  none: "muted",
};

export function DeadlineBadge({ deadline }: { deadline: Date | null }) {
  if (!deadline) return null;
  const urgency = urgencyOf(deadline);
  return <Badge variant={URGENCY_VARIANT[urgency]}>{deadlineLabel(deadline)}</Badge>;
}
