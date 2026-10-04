import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getInsights } from "@/lib/data/insights";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { termLabel } from "@/lib/terms";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function pct(n: number, d: number) {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

function RateTable({ rows, empty }: { rows: { label: string; applied: number; responded: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-muted-2">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.applied));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-text">{r.label}</span>
            <span className="text-muted tabular-nums">
              {r.responded}/{r.applied} · <span className="font-semibold text-text">{pct(r.responded, r.applied)}</span>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent/30" style={{ width: `${(r.applied / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(r.responded / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function InsightsPage() {
  const data = await getInsights();
  const applied = data.funnel[0]?.count ?? 0;
  const maxWeek = Math.max(1, ...data.weekly.map((w) => w.count));

  if (applied === 0) {
    return (
      <div>
        <PageHeader title="Insights" description="How your search is going, from co-op applications you've logged." />
        <EmptyState icon={BarChart3} title="No co-op applications yet" description="Once you've logged a few, you'll see your funnel, response rates, and weekly pace here." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Insights" description="How your search is going, based on the co-op applications you've logged." />

      <section>
        <SectionTitle>Funnel</SectionTitle>
        <Card className="space-y-3">
          {data.funnel.map((step, i) => (
            <div key={step.stage} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 sm:grid-cols-[150px_1fr_110px]">
              <span className="text-sm font-medium">{step.label}</span>
              <div className="h-7 overflow-hidden rounded-lg bg-surface-2">
                <div
                  className="flex h-full items-center rounded-lg bg-gradient-to-r from-accent to-violet px-2 text-xs font-semibold text-accent-fg tabular-nums"
                  style={{ width: `${Math.max(step.count ? 6 : 0, (step.count / applied) * 100)}%` }}
                >
                  {step.count > 0 ? step.count : ""}
                </div>
              </div>
              <span className="text-right text-xs text-muted tabular-nums">
                {i === 0 ? "—" : `${pct(step.count, applied)} of applied`}
              </span>
            </div>
          ))}
          <p className="border-t border-border pt-3 text-xs text-muted-2">
            {data.outcomes.rejected} rejected · {data.outcomes.ghosted} ghosted · {data.outcomes.withdrawn} withdrawn
            {data.medianDaysToResponse != null && ` · median ${data.medianDaysToResponse} days from applying to first response`}
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Applications per week</SectionTitle>
        <Card>
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Applications per week, last 16 weeks">
            {data.weekly.map((w) => (
              <div key={w.weekStart.toISOString()} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-muted-2 opacity-0 tabular-nums group-hover:opacity-100">{w.count}</span>
                <div
                  className="w-full rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent"
                  style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: w.count ? 4 : 1 }}
                  title={`Week of ${shortDate.format(w.weekStart)}: ${w.count}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-2">
            <span>{shortDate.format(data.weekly[0].weekStart)}</span>
            <span>This week</span>
          </div>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>Response rate by channel</SectionTitle>
          <Card>
            <RateTable rows={data.byChannel} empty="Set “Applied via” on applications to compare channels." />
          </Card>
        </section>
        <section>
          <SectionTitle>Response rate by resume</SectionTitle>
          <Card>
            <RateTable rows={data.byResume} empty="Fill in “Resume sent” to see which version lands interviews." />
          </Card>
        </section>
      </div>

      {data.byTerm.length > 0 && (
        <section>
          <SectionTitle>By term</SectionTitle>
          <Card padded={false} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-2">
                  <th className="px-4 py-2.5 font-medium">Term</th>
                  <th className="px-4 py-2.5 text-right font-medium">Applied</th>
                  <th className="px-4 py-2.5 text-right font-medium">Interviews</th>
                  <th className="px-4 py-2.5 text-right font-medium">Offers</th>
                  <th className="px-4 py-2.5 text-right font-medium">Interview rate</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.byTerm.map((t) => (
                  <tr key={t.term} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{termLabel(t.term)}</td>
                    <td className="px-4 py-2.5 text-right">{t.applied}</td>
                    <td className="px-4 py-2.5 text-right">{t.interviews}</td>
                    <td className="px-4 py-2.5 text-right">{t.offers}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{pct(t.interviews, t.applied)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}
