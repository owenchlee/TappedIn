import Link from "next/link";
import { clsx } from "clsx";
import { ArrowRight, CalendarCheck2, CalendarClock, Gift, MessageSquare, Mic, Send, Trophy, UserRound, Flag } from "lucide-react";
import type { AgendaItem, AgendaKind } from "@/lib/data/agenda";
import { daysUntil } from "@/lib/deadline";
import { CompanyLogo } from "@/components/CompanyLogo";

export const AGENDA_STYLE: Record<AgendaKind, { icon: typeof Mic; tone: string; label: string }> = {
  interview: { icon: Mic, tone: "bg-amber/15 text-amber", label: "Interview" },
  oa: { icon: CalendarCheck2, tone: "bg-violet/15 text-violet", label: "OA" },
  offer: { icon: Gift, tone: "bg-emerald/15 text-emerald", label: "Offer" },
  follow_up: { icon: Send, tone: "bg-sky/15 text-sky", label: "Follow-up" },
  note: { icon: MessageSquare, tone: "bg-surface-3 text-muted", label: "Note" },
  deadline: { icon: CalendarClock, tone: "bg-overdue/12 text-overdue", label: "Deadline" },
  next_step: { icon: ArrowRight, tone: "bg-accent/15 text-accent", label: "Next step" },
  hackathon: { icon: Trophy, tone: "bg-sky/15 text-sky", label: "Hackathon" },
  org_deadline: { icon: Flag, tone: "bg-urgent/15 text-urgent", label: "Closes" },
  contact: { icon: UserRound, tone: "bg-sky/15 text-sky", label: "Follow-up" },
};

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });

function dayHeading(d: Date): string {
  const days = daysUntil(d);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return dayFmt.format(d);
}

export function AgendaRow({ item }: { item: AgendaItem }) {
  const style = AGENDA_STYLE[item.kind];
  const Icon = style.icon;
  return (
    <Link href={item.href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
      {item.logoName ? (
        <span className="relative">
          <CompanyLogo name={item.logoName} url={item.logoUrl} size="sm" />
          <span className={clsx("absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2 ring-surface", style.tone)}>
            <Icon className="size-2.5" />
          </span>
        </span>
      ) : (
        <span className={clsx("flex size-7 items-center justify-center rounded-md", style.tone)}>
          <Icon className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{item.title}</p>
        <p className="truncate text-xs text-muted-2">{item.subtitle}</p>
      </div>
      <span className="shrink-0 text-xs text-muted tabular-nums">{item.allDay ? style.label : timeFmt.format(item.at)}</span>
    </Link>
  );
}

export function AgendaList({ items, empty }: { items: AgendaItem[]; empty?: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const heading = dayHeading(item.at);
    groups.set(heading, [...(groups.get(heading) ?? []), item]);
  }
  return (
    <div className="space-y-4">
      {[...groups].map(([heading, group]) => (
        <div key={heading}>
          <h3 className={clsx("mb-1 px-3 pt-1 text-xs font-semibold", heading === "Overdue" ? "text-overdue" : heading === "Today" ? "text-accent" : "text-muted-2")}>
            {heading}
          </h3>
          <div className="space-y-0.5">
            {group.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
