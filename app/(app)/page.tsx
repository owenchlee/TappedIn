import Link from "next/link";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { getAgenda, getOverdue } from "@/lib/data/agenda";
import { getClosingSoon, getTopMatches, getOpenOpportunities, getStaleApplications, getTodayStats } from "@/lib/data/home";
import { jobsSeenAt } from "@/lib/data/nav";
import { listUnseenSignals } from "@/lib/data/orgs";
import { DismissSignalButton } from "@/components/DismissSignalButton";
import { AgendaList } from "@/components/AgendaList";
import { StatCard } from "@/components/StatCard";
import { CompanyLogo } from "@/components/CompanyLogo";
import { StageButton } from "@/components/StageButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionTitle } from "@/components/ui/PageHeader";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { FitScore } from "@/components/jobs/FitSummary";
import { formatDate } from "@/lib/deadline";
import { relativeTime } from "@/lib/format";
import { nextTerm, termForDate, termLabel, termShortLabel } from "@/lib/terms";
import { listJobs } from "@/lib/autoapply/job";
import { queueOrder } from "@/lib/autoapply/queue";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hour12: false }).format(now));
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover">
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

/** One row inside a list card: logo, two lines of text, something on the right. */
function ListRow({
  name,
  url,
  title,
  subtitle,
  right,
}: {
  name: string;
  url?: string | null;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <>
      <CompanyLogo name={name} url={url} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{title}</p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>
      {right}
    </>
  );
}

const ROW = "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2";

export default async function HomePage() {
  const now = new Date();
  const seenAt = await jobsSeenAt();
  const [stats, agenda, overdue, stale, fresh, opportunities, signals, closing] = await Promise.all([
    getTodayStats(now),
    getAgenda(new Date(now.getTime() - DAY / 2), new Date(now.getTime() + 14 * DAY)),
    getOverdue(now),
    getStaleApplications(now),
    getTopMatches(),
    getOpenOpportunities(now),
    listUnseenSignals(),
    getClosingSoon(now),
  ]);
  const term = termForDate(now);
  const dateLine = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" }).format(now);
  const upNext = [...overdue, ...agenda];
  const applyQueue = process.env.AUTO_APPLY_ENABLED === "1" ? queueOrder(listJobs(), now) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <p className="text-sm text-muted">
          {dateLine} · recruiting for {termLabel(nextTerm(term))}
        </p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">
          {greeting(now)}
          {process.env.DISPLAY_NAME ? `, ${process.env.DISPLAY_NAME}` : ""}.
        </h1>
      </header>

      {applyQueue.length > 0 && (
        <Link href="/apply/queue" className="flex items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-accent-fg shadow-card transition-colors hover:bg-accent-hover">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {applyQueue.length} application{applyQueue.length === 1 ? "" : "s"} ready to send
            </p>
            <p className="truncate text-sm opacity-80">Resumes tailored overnight. Starts with {applyQueue[0].company}.</p>
          </div>
          <ArrowRight className="size-5 shrink-0" />
        </Link>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="In progress" value={stats.active} hint={`${stats.applied30d} applied this month`} href="/applications" />
        <StatCard label="Interviews" value={stats.interviewsAhead} hint="next 2 weeks" tone={stats.interviewsAhead ? "amber" : "text"} href="/calendar" />
        <StatCard label="Offers" value={stats.offers} hint="to decide on" tone={stats.offers ? "emerald" : "text"} href="/applications" />
      </div>

      <section>
        <SectionTitle action={<SeeAll href="/calendar">Calendar</SeeAll>}>Up next</SectionTitle>
        <Card className="p-2">
          <AgendaList
            items={upNext}
            empty={
              <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
                <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <CalendarDays className="size-5" />
                </span>
                <p className="text-sm font-medium">Nothing in the next two weeks</p>
                <p className="text-sm text-muted">Interviews, OAs and deadlines you add will show up here.</p>
              </div>
            }
          />
        </Card>
      </section>

      {(signals.length > 0 || stale.length > 0) && (
        <section>
          <SectionTitle>Needs a quick look</SectionTitle>
          <Card className="space-y-0.5 p-2">
            {signals.map((o) => (
              <div key={o.id} className={ROW}>
                <a href={o.applyUrl ?? o.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  <ListRow name={o.name} url={o.url} title={o.name} subtitle={`${o.signal}${o.signalAt ? ` · ${relativeTime(o.signalAt)}` : ""}`} />
                </a>
                <DismissSignalButton id={o.id} />
              </div>
            ))}
            {stale.map((s) => {
              const name = s.coopPosting?.company ?? s.organization?.name ?? "";
              return (
                <div key={s.id} className={ROW}>
                  <Link href={`/applications/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <ListRow
                      name={name}
                      url={s.coopPosting?.url ?? s.organization?.url}
                      title={s.coopPosting?.role ?? name}
                      subtitle={`${name} · no reply since ${s.appliedAt ? formatDate(s.appliedAt) : relativeTime(s.statusChangedAt)}`}
                    />
                  </Link>
                  <StageButton id={s.id} status="ghosted">
                    Mark ghosted
                  </StageButton>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {closing.length > 0 && (
        <section>
          <SectionTitle action={<SeeAll href="/jobs?region=all&sort=deadline">By deadline</SeeAll>}>Closing this week</SectionTitle>
          <Card className="space-y-0.5 p-2">
            {closing.map((job) => (
              <a key={job.id} href={job.url} target="_blank" rel="noopener noreferrer" className={ROW}>
                <ListRow
                  name={job.company}
                  url={job.url}
                  title={job.role}
                  subtitle={`${job.company}${job.location ? ` · ${job.location}` : ""}`}
                  right={
                    <div className="flex shrink-0 items-center gap-2">
                      <DeadlineBadge deadline={job.deadline} />
                      {job.fitScore != null && <FitScore score={job.fitScore} reasons={job.fitReasons} />}
                    </div>
                  }
                />
              </a>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle action={<SeeAll href="/jobs?region=all">All matches</SeeAll>}>Best matches for you</SectionTitle>
        {fresh.length === 0 ? (
          <Card className="flex flex-col items-center gap-1.5 py-10 text-center">
            <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-sm text-muted">You&apos;ve saved or applied to every good match. New postings arrive each morning.</p>
          </Card>
        ) : (
          <Card className="space-y-0.5 p-2">
            {fresh.map((job) => (
              <a key={job.id} href={job.url} target="_blank" rel="noopener noreferrer" className={ROW}>
                <ListRow
                  name={job.company}
                  url={job.url}
                  title={job.role}
                  subtitle={`${job.company}${job.location ? ` · ${job.location}` : ""}`}
                  right={
                    <div className="flex shrink-0 items-center gap-2">
                      {job.firstSeenAt > seenAt && (
                        <Badge variant="new" className="hidden sm:inline-flex">
                          New
                        </Badge>
                      )}
                      {job.terms.slice(0, 1).map((t) => (
                        <Badge key={t} variant="accent" className="hidden sm:inline-flex">
                          {termShortLabel(t)}
                        </Badge>
                      ))}
                      <span className="hidden text-xs text-muted-2 sm:inline">{relativeTime(job.firstSeenAt)}</span>
                      {job.fitScore != null && <FitScore score={job.fitScore} reasons={job.fitReasons} />}
                    </div>
                  }
                />
              </a>
            ))}
          </Card>
        )}
      </section>

      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-4">
        <section>
          <SectionTitle action={<SeeAll href="/hackathons">All</SeeAll>}>Hackathons soon</SectionTitle>
          <Card className="space-y-0.5 p-2">
            {opportunities.hackathons.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">None scheduled nearby yet.</p>}
            {opportunities.hackathons.map((h) => (
              <a key={h.id} href={h.url} target="_blank" rel="noopener noreferrer" className={ROW}>
                <ListRow
                  name={h.name}
                  url={h.url}
                  title={h.name}
                  subtitle={h.location ?? "Location TBA"}
                  right={<span className="shrink-0 text-xs text-muted tabular-nums">{h.eventStart ? formatDate(h.eventStart) : ""}</span>}
                />
              </a>
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle action={<SeeAll href="/design-teams">All</SeeAll>}>Teams &amp; clubs open</SectionTitle>
          <Card className="space-y-0.5 p-2">
            {opportunities.orgs.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Nothing open right now.</p>}
            {opportunities.orgs.map((o) => (
              <a key={o.id} href={o.applyUrl ?? o.url} target="_blank" rel="noopener noreferrer" className={ROW}>
                <ListRow
                  name={o.name}
                  url={o.url}
                  title={o.name}
                  subtitle={o.kind === "design_team" ? "Design team" : "Club"}
                  right={<DeadlineBadge deadline={o.deadline} />}
                />
              </a>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
