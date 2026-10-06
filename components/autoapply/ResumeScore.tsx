import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import type { ResumeScore as Score } from "@/lib/autoapply/job";

/** The overall score as a small badge, for lists. */
export function ResumeScoreBadge({ ats }: { ats?: Score }) {
  if (!ats) return null;
  return (
    <Badge variant={ats.passed ? "emerald" : "accent"} title={ats.passed ? "Passed the ATS and recruiter checks" : `Best your experience allows (short on ${ats.shortfalls.join(", ")})`}>
      Score {ats.overall}
    </Badge>
  );
}

function Meter({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-text">{value == null ? "–" : value}</p>
    </div>
  );
}

/** What the quality loop found on the resume it kept: the scores, what's left, and what no rewrite can fix. */
export function ResumeScoreCard({ ats }: { ats?: Score }) {
  if (!ats) return null;
  return (
    <section>
      <SectionTitle>Resume check</SectionTitle>
      <Card className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-sm text-text">
          <ResumeScoreBadge ats={ats} />
          {ats.passed
            ? `Passed${ats.revisions ? ` after ${ats.revisions} rewrite${ats.revisions > 1 ? "s" : ""}` : " on the first draft"}.`
            : ats.revisions && ats.firstDraft != null
              ? `Best your experience allows: up from ${ats.firstDraft} on the first draft.`
              : "Best your experience allows; the rewrite didn't beat the first draft."}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Meter label="Keyword match" value={ats.keywords} hint={`Posting keywords your experience backs, matched the way ATS search reads the PDF. Against everything the posting names: ${ats.rawMatch}.`} />
          <Meter label="Recruiter scan" value={ats.scan} hint="Action verbs, numbers, bullet length, dangling lines, what sits at the top and the left edge" />
          <Meter label="Parsing" value={ats.parse} hint="What an ATS can pull from the PDF: readable text, contact details, headings, dates" />
          <Meter label="Recruiter review" value={ats.review == null ? null : ats.review * 10} hint="A separate Claude pass reading the PDF as a recruiter would, scored 1 to 10" />
        </div>
        {ats.firstImpression && <p className="text-xs text-muted">Recruiter&apos;s first impression: {ats.firstImpression}</p>}
        {ats.unattainable.length > 0 && (
          <p className="rounded-md bg-amber/12 px-2 py-1.5 text-xs text-amber">
            The posting asks for {ats.unattainable.join(", ")}, which your experience doesn&apos;t back, so the resume leaves them out.
          </p>
        )}
        {ats.issues.length > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer font-medium text-accent">Notes on this version ({ats.issues.length})</summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {ats.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </section>
  );
}
