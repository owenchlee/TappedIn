import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/data/settings";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { TermTile, AddOfferToJourney, JourneyStartPicker } from "@/components/journey/TermTile";
import { CompanyLogo } from "@/components/CompanyLogo";
import { parseTermCode, termForDate, termLabel, termRange, termSortKey } from "@/lib/terms";

export const metadata: Metadata = { title: "Journey" };
export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const current = termForDate(new Date());
  const [terms, startSetting, offers] = await Promise.all([
    prisma.term.findMany(),
    getSetting("journeyStart"),
    prisma.savedItem.findMany({
      where: { category: "coop", status: { in: ["offer", "accepted"] }, workTerm: null },
      include: { coopPosting: true },
    }),
  ]);
  const earliest = terms.map((t) => t.code).sort((a, b) => termSortKey(a) - termSortKey(b))[0];
  const start = startSetting && parseTermCode(startSetting) ? startSetting : (earliest ?? current);
  const codes = termRange(start, 15); // five years of terms
  for (const t of terms) if (!codes.includes(t.code)) codes.push(t.code);
  codes.sort((a, b) => termSortKey(a) - termSortKey(b));
  const byCode = new Map(terms.map((t) => [t.code, t]));

  const years = new Map<number, string[]>();
  for (const code of codes) {
    // Group into academic years (Fall starts a year).
    const t = parseTermCode(code)!;
    const acYear = t.season === "F" ? t.year : t.year - 1;
    years.set(acYear, [...(years.get(acYear) ?? []), code]);
  }
  const workTerms = terms.filter((t) => t.kind === "work" && t.company);

  return (
    <div>
      <PageHeader
        title="Journey"
        description="Your degree, term by term — study terms, co-ops, and what each one was like. Click a term to fill it in."
        actions={<JourneyStartPicker start={start} />}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-muted">Work terms logged</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{workTerms.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Companies</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{new Set(workTerms.map((t) => t.company)).size}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Now</p>
          <p className="mt-1 text-lg font-semibold">{termLabel(current)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Avg. rating</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {workTerms.some((t) => t.rating)
              ? (workTerms.filter((t) => t.rating).reduce((s, t) => s + (t.rating ?? 0), 0) / workTerms.filter((t) => t.rating).length).toFixed(1)
              : "—"}
          </p>
        </Card>
      </div>

      {offers.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Offers not on your journey yet</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {offers.map((o) => (
              <Card key={o.id} className="flex items-center gap-3">
                <CompanyLogo name={o.coopPosting!.company} url={o.coopPosting!.url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.coopPosting!.role}</p>
                  <p className="truncate text-xs text-muted">
                    {o.coopPosting!.company}
                    {o.term ? ` · ${termLabel(o.term)}` : " · no term set"}
                  </p>
                </div>
                <AddOfferToJourney savedId={o.id} />
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-6">
        {[...years].map(([year, yearCodes]) => (
          <section key={year}>
            <h2 className="mb-2 text-xs font-semibold text-muted-2">
              {year}–{String((year + 1) % 100).padStart(2, "0")}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {yearCodes.map((code) => (
                <TermTile key={code} code={code} term={byCode.get(code) ?? null} isCurrent={code === current} isPast={termSortKey(code) < termSortKey(current)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
