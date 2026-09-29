import Link from "next/link";
import { Briefcase, CalendarDays, Gift, Mic, Send, Sparkles, Trophy, Hourglass, ArrowUpRight, BellRing } from "lucide-react";
import { getAgenda, getOverdue } from "@/lib/data/agenda";
import { getFreshJobs, getOpenOpportunities, getStaleApplications, getTodayStats } from "@/lib/data/home";
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
import { formatDate } from "@/lib/deadline";
import { relativeTime } from "@/lib/format";
import { nextTerm, termForDate, termLabel, termShortLabel } from "@/lib/terms";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hour12: false }).format(now));
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const now = new Date();
  const seenAt = await jobsSeenAt();
  const [stats, agenda, overdue, stale, fresh, opportunities, signals] = await Promise.all([
    getTodayStats(now),
    getAgenda(new Date(now.getTime() - DAY / 2), new Date(now.getTime() + 14 * DAY)),
    getOverdue(now),
    getStaleApplications(now),
    getFreshJobs(seenAt),
    getOpenOpportunities(now),
    listUnseenSignals(),
  ]);
  const term = termForDate(now);
  const dateLine = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" }).format(now);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium text-muted-2">
          {dateLine} · {termLabel(term)} · recruiting for {termLabel(nextTerm(term))}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{greeting(now)}{process.env.DISPLAY_NAME ? `, ${process.env.DISPLAY_NAME}` : ""}.</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="In progress" value={stats.active} hint={`${stats.applied30d} applied in the last 30 days`} icon={Send} href="/applications" />
        <StatCard label="Interviews & OAs" value={stats.interviewsAhead} hint="in the next two weeks" icon={Mic} tone="amber" href="/calendar" />
        <StatCard label="Offers" value={stats.offers} hint="waiting on your decision" icon={Gift} tone="emerald" href="/applications" />
        <StatCard
          label="Response rate"
          value={stats.responseRate == null ? "—" : `${Math.round(stats.responseRate * 100)}%`}
          hint={stats.responseRate == null ? "shows after 5 co-op applications" : "applications that got an OA or interview"}
          icon={Sparkles}
          tone="violet"
          href="/insights"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section>
            <SectionTitle
              action={
                <Link href="/calendar" className="text-xs font-medium text-muted hover:text-text">
                  Calendar →
                </Link>
              }
            >
              Up next
            </SectionTitle>
            <Card className="p-2">
              <AgendaList
                items={[...overdue, ...agenda]}
                empty={
                  <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                    <CalendarDays className="mb-1 size-5 text-muted-2" />
                    <p className="text-sm font-medium">Nothing scheduled for the next two weeks</p>
                    <p className="text-xs text-muted-2">Interviews, OAs, deadlines and follow-ups you log will show up here.</p>
                  </div>
                }
              />
            </Card>
          </section>

          <section>
            <SectionTitle
              action={
                <Link href="/jobs?new=1" className="text-xs font-medium text-muted hover:text-text">
                  All new jobs →
                </Link>
              }
            >
              Fresh in Canada &amp; remote
            </SectionTitle>
            {fresh.length === 0 ? (
              <Card className="py-8 text-center text-sm text-muted-2">You&apos;re caught up — no new postings since your last visit.</Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fresh.map((job) => (
                  <a
                    key={job.id}
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-card transition-all hover:border-border-strong hover:shadow-pop"
                  >
                    <CompanyLogo name={job.company} url={job.url} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-snug font-medium group-hover:text-accent">{job.role}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {job.terms.slice(0, 2).map((t) => (
                          <Badge key={t} variant="accent">
                            {termShortLabel(t)}
                          </Badge>
                        ))}
                        <span className="text-[11px] text-muted-2">{relativeTime(job.firstSeenAt)}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          {signals.length > 0 && (
            <section>
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <BellRing className="size-4 text-accent" />
                  Heads up
                </span>
              </SectionTitle>
              <Card className="space-y-1 p-2">
                {signals.map((o) => (
                  <div key={o.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <CompanyLogo name={o.name} url={o.url} size="sm" />
                    <a href={o.applyUrl ?? o.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:underline">{o.name}</p>
                      <p className="truncate text-xs text-muted-2">
                        {o.signal} · {o.signalAt ? relativeTime(o.signalAt) : ""}
                      </p>
                    </a>
                    <DismissSignalButton id={o.id} />
                  </div>
                ))}
              </Card>
            </section>
          )}

          {stale.length > 0 && (
            <section>
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Hourglass className="size-4 text-muted-2" />
                  No word in 3+ weeks
                </span>
              </SectionTitle>
              <Card className="space-y-1 p-2">
                {stale.map((s) => {
                  const name = s.coopPosting?.company ?? s.organization?.name ?? "";
                  return (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                      <CompanyLogo name={name} url={s.coopPosting?.url ?? s.organization?.url} size="sm" />
                      <Link href={`/applications/${s.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium hover:underline">{s.coopPosting?.role ?? name}</p>
                        <p className="truncate text-xs text-muted-2">
                          {name} · applied {s.appliedAt ? formatDate(s.appliedAt) : relativeTime(s.statusChangedAt)}
                        </p>
                      </Link>
                      <StageButton id={s.id} status="ghosted">
                        Ghosted
                      </StageButton>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle
              action={
                <Link href="/hackathons" className="text-xs font-medium text-muted hover:text-text">
                  All →
                </Link>
              }
            >
              <span className="flex items-center gap-1.5">
                <Trophy className="size-4 text-muted-2" />
                Hackathons coming up
              </span>
            </SectionTitle>
            <Card className="space-y-1 p-2">
              {opportunities.hackathons.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-2">None scheduled nearby yet.</p>}
              {opportunities.hackathons.map((h) => (
                <a key={h.id} href={h.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <CompanyLogo name={h.name} url={h.url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.name}</p>
                    <p className="truncate text-xs text-muted-2">{h.location ?? "—"}</p>
                  </div>
                  <span className="text-xs text-muted tabular-nums">{h.eventStart ? formatDate(h.eventStart) : ""}</span>
                </a>
              ))}
            </Card>
          </section>

          <section>
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <Briefcase className="size-4 text-muted-2" />
                Teams &amp; clubs recruiting
              </span>
            </SectionTitle>
            <Card className="space-y-1 p-2">
              {opportunities.orgs.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-2">Nothing marked open right now. Check the Design teams and Clubs tabs.</p>
              )}
              {opportunities.orgs.map((o) => (
                <a
                  key={o.id}
                  href={o.applyUrl ?? o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                >
                  <CompanyLogo name={o.name} url={o.url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    <p className="truncate text-xs text-muted-2">{o.kind === "design_team" ? "Design team" : "Club"}</p>
                  </div>
                  <DeadlineBadge deadline={o.deadline} />
                </a>
              ))}
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}
