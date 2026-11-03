import type { Metadata } from "next";
import { Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { SearchBox } from "@/components/SearchBox";
import { NewOutreachButton, OutreachCard } from "@/components/outreach/OutreachCard";
import { OUTREACH_STATUSES, STATUS_LABEL, type OutreachStatus } from "@/lib/outreach";

export const metadata: Metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

export default async function OutreachPage({ searchParams }: PageProps<"/outreach">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const raw = typeof sp.s === "string" ? sp.s : "draft";
  const tab: OutreachStatus = (OUTREACH_STATUSES as readonly string[]).includes(raw) ? (raw as OutreachStatus) : "draft";

  const all = await prisma.outreachEmail.findMany({
    orderBy: [{ followUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  const counts = Object.fromEntries(OUTREACH_STATUSES.map((s) => [s, all.filter((r) => r.status === s).length]));
  const needle = q.toLowerCase();
  const rows = all.filter(
    (r) =>
      r.status === tab &&
      (!needle || [r.company, r.contactName, r.about, r.location, r.notes, r.tier, r.email].some((v) => v.toLowerCase().includes(needle))),
  );

  return (
    <div>
      <PageHeader
        title="Outreach"
        description="Cold emails to founders and small companies for part-time and co-op roles that aren't posted anywhere. Nothing is sent from here: open it in Outlook, send it yourself, then mark it sent. Addresses that are guesses or only weakly checked have no Outlook button until verified."
        actions={
          <>
            <SearchBox placeholder="Search companies…" />
            <NewOutreachButton />
          </>
        }
      />
      <LinkTabs
        className="mb-5"
        items={OUTREACH_STATUSES.map((s) => ({
          href: s === "draft" ? "/outreach" : `/outreach?s=${s}`,
          label: STATUS_LABEL[s],
          active: s === tab,
          count: counts[s],
        }))}
      />
      {all.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No cold emails yet"
          description="Add one, or run `npx tsx scripts/import-outreach.ts` to load private/startup-outreach.md."
        />
      ) : rows.length === 0 ? (
        <EmptyState title={q ? "Nothing matches that search" : `Nothing in ${STATUS_LABEL[tab].toLowerCase()}`} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <OutreachCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
