import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Layers } from "lucide-react";
import { getApplication } from "@/lib/data/applications";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionTitle } from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { NotesEditor } from "@/components/NotesEditor";
import { StageControl } from "@/components/applications/StageControl";
import { Timeline } from "@/components/applications/Timeline";
import { DetailsForm } from "@/components/applications/DetailsForm";
import { ApplicationContacts } from "@/components/applications/ApplicationContacts";
import { prisma } from "@/lib/db";
import { REGION_LABELS, type Region } from "@/lib/types";
import { hostnameFromUrl } from "@/lib/format";
import { termLabel } from "@/lib/terms";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/applications/[id]">): Promise<Metadata> {
  const found = await getApplication((await params).id);
  return { title: found ? `${found.view.title} · ${found.view.company}` : "Application" };
}

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  const found = await getApplication(id);
  if (!found) notFound();
  const { view: app, row } = found;
  const allContacts = await prisma.contact.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, company: true } });

  const posting = row.coopPosting;
  const sources = posting
    ? [
        { name: posting.source?.name ?? (posting.origin === "manual" ? "Added by you" : "Source"), url: posting.url },
        ...posting.duplicates.map((d) => ({ name: d.sourceKey ?? "Another source", url: d.url })),
      ]
    : [];

  return (
    <div className="space-y-6">
      <Link href="/applications" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text">
        <ArrowLeft className="size-3.5" />
        Applications
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyLogo name={app.entityKind === "coop" ? app.company : app.title} url={app.url} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-balance">{app.title}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {app.company}
              {app.location ? ` · ${app.location}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {app.term && <Badge variant="accent">{termLabel(app.term)}</Badge>}
              <DeadlineBadge deadline={app.deadline} />
              {posting?.region && <Badge>{REGION_LABELS[posting.region as Region]}</Badge>}
              <Badge>{hostnameFromUrl(app.url)}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={app.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
              Open posting
              <ExternalLink />
            </a>
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <StageControl id={app.id} status={app.status} category={app.category} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section>
            <SectionTitle>Timeline</SectionTitle>
            <Timeline savedId={app.id} events={row.events} createdAt={row.createdAt} />
          </section>
          <section>
            <SectionTitle>Notes</SectionTitle>
            <Card>
              <NotesEditor kind={app.entityKind} id={app.entityId} initialNotes={app.notes} alwaysOpen placeholder="Interview questions, who you talked to, salary notes, why you want it…" />
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <SectionTitle>Details</SectionTitle>
            <Card>
              <DetailsForm app={app} />
            </Card>
          </section>
          <section>
            <SectionTitle>People</SectionTitle>
            <ApplicationContacts savedId={app.id} company={app.entityKind === "coop" ? app.company : ""} linked={row.contacts} all={allContacts} />
          </section>
          {sources.length > 1 && (
            <section>
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Layers className="size-4 text-muted-2" />
                  Listed on {sources.length} sources
                </span>
              </SectionTitle>
              <Card className="space-y-1.5 text-xs">
                {sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 text-muted hover:text-text">
                    <span className="truncate">{s.name}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ))}
              </Card>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
