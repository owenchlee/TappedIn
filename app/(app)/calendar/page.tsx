import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAgenda, type AgendaItem } from "@/lib/data/agenda";
import { AgendaList, AGENDA_STYLE } from "@/components/AgendaList";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { CopyField } from "@/components/CopyField";
import { calendarToken } from "@/lib/auth";
import { storageToDateInput } from "@/lib/deadline";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

/** From 12 hours ago to 45 days out. */
function upcomingWindow(): [Date, Date] {
  const now = Date.now();
  return [new Date(now - 43_200_000), new Date(now + 45 * 86_400_000)];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthParam(y: number, m: number) {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const today = storageToDateInput(new Date());
  const [ty, tm] = today.split("-").map(Number);
  const param = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthParam(ty, tm - 1);
  const [year, month] = param.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid

  const from = new Date(Date.UTC(year, month - 1, 1 - lead));
  const to = new Date(Date.UTC(year, month, 7));
  const [items, upcoming, token, h] = await Promise.all([
    getAgenda(from, to),
    getAgenda(...upcomingWindow()),
    calendarToken(),
    headers(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const feedUrl = `${proto}://${host}/api/calendar/${token}.ics`;

  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) {
    // Multi-day events (hackathons) appear on every day they span.
    const start = item.at.getTime();
    const end = (item.end ?? item.at).getTime();
    for (let t = start; t <= end; t += 86_400_000) {
      const key = storageToDateInput(new Date(t));
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
  }

  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, 1 - lead + i, 12));
    return { date: d, key: storageToDateInput(d), inMonth: d.getUTCMonth() === month - 1 };
  });
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Interviews, OAs, deadlines, next steps and hackathons in one view."
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/calendar?month=${monthParam(year, month - 2)}`} className={buttonClasses("secondary", "sm")} aria-label="Previous month">
              <ChevronLeft />
            </Link>
            <Link href="/calendar" className={buttonClasses("secondary", "sm")}>
              Today
            </Link>
            <Link href={`/calendar?month=${monthParam(year, month)}`} className={buttonClasses("secondary", "sm")} aria-label="Next month">
              <ChevronRight />
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</div>
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/50 text-center text-[11px] font-medium text-muted-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayItems = byDay.get(cell.key) ?? [];
              const isToday = cell.key === today;
              return (
                <div
                  key={cell.key}
                  className={clsx("min-h-20 border-r border-b border-border p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0", !cell.inMonth && "bg-surface-2/40")}
                >
                  <div
                    className={clsx(
                      "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday ? "bg-accent font-semibold text-accent-fg" : cell.inMonth ? "text-text" : "text-muted-2",
                    )}
                  >
                    {cell.date.getUTCDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        title={`${item.title} — ${item.subtitle}`}
                        className={clsx("block truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium sm:text-[11px]", AGENDA_STYLE[item.kind].tone)}
                      >
                        {item.title}
                      </Link>
                    ))}
                    {dayItems.length > 3 && <p className="px-1 text-[10px] text-muted-2">+{dayItems.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <aside className="space-y-6">
          <section>
            <SectionTitle>Next 45 days</SectionTitle>
            <Card className="p-2">
              <AgendaList items={upcoming} empty={<p className="px-2 py-8 text-center text-xs text-muted-2">Nothing coming up.</p>} />
            </Card>
          </section>
          <section>
            <SectionTitle>Subscribe</SectionTitle>
            <Card className="space-y-2">
              <p className="text-xs text-muted">
                Add this URL to Google Calendar (Other calendars → From URL) or Apple Calendar (File → New Calendar Subscription) to get
                everything on your phone. Keep it private — anyone with the link can read it.
              </p>
              <CopyField value={feedUrl} />
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}
