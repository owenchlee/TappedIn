import type { Metadata } from "next";
import { headers } from "next/headers";
import { CalendarDays, Download, FileSpreadsheet, LogOut, ShieldCheck, Target } from "lucide-react";
import { JobPrefsForm } from "@/components/JobPrefsForm";
import { getJobPrefs } from "@/lib/fit/store";
import { termForDate, termRange } from "@/lib/terms";
import { prisma } from "@/lib/db";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { CopyField } from "@/components/CopyField";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { authEnabled, calendarToken } from "@/lib/auth";
import { logout } from "@/actions/auth";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [token, h, counts, prefs] = await Promise.all([
    calendarToken(),
    headers(),
    Promise.all([prisma.savedItem.count(), prisma.contact.count(), prisma.term.count(), prisma.applicationEvent.count()]),
    getJobPrefs(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const [apps, contacts, terms, events] = counts;

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Settings" />

      <section id="job-prefs">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Target className="size-4 text-muted-2" />
            What you&apos;re looking for
          </span>
        </SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-muted">
            The Jobs page ranks every posting against this and hides the ones you can&apos;t apply to (another graduating class, upper years
            only, grad students only, U.S. citizens only).
          </p>
          <JobPrefsForm prefs={prefs} terms={termRange(termForDate(new Date()), 6)} />
        </Card>
      </section>

      <section>
        <SectionTitle>Appearance</SectionTitle>
        <Card className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted">Light, dark, or follow your system.</p>
          <div className="w-40">
            <ThemeToggle />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Back up your data</SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-muted">
            {apps} applications, {events} timeline events, {contacts} contacts and {terms} terms. Download a copy every so often — it&apos;s your
            record of five years of co-op searching.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" className={buttonClasses("secondary")}>
              <Download />
              Full backup (JSON)
            </a>
            <a href="/api/export?format=csv" className={buttonClasses("secondary")}>
              <FileSpreadsheet />
              Applications (CSV)
            </a>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-muted-2" />
            Calendar feed
          </span>
        </SectionTitle>
        <Card className="space-y-2">
          <p className="text-sm text-muted">Subscribe in Google or Apple Calendar to see interviews, deadlines and hackathons on your phone.</p>
          <CopyField value={`${proto}://${host}/api/calendar/${token}.ics`} />
        </Card>
      </section>

      <section>
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-muted-2" />
            Access
          </span>
        </SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">
            {authEnabled()
              ? "Password protected. Change APP_PASSWORD in your hosting settings to rotate it — that also signs out every device."
              : "No APP_PASSWORD set, so there's no login. Fine locally — always set one when deployed."}
          </p>
          {authEnabled() && (
            <form action={logout}>
              <button type="submit" className={buttonClasses("secondary")}>
                <LogOut />
                Sign out
              </button>
            </form>
          )}
        </Card>
      </section>
    </div>
  );
}
