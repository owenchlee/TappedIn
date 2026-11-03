"use client";

import { useState, useTransition } from "react";
import { BellRing, Check, Copy, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { deleteOutreach, saveOutreach, setLinkedinStatus, setOutreachStatus } from "@/actions/outreach";
import { formatDate, urgencyOf } from "@/lib/deadline";
import {
  EMAIL_CHECKS,
  EMAIL_CHECK_LABEL,
  EMAIL_CHECK_SAFE,
  LINKEDIN_LABEL,
  LINKEDIN_STATUSES,
  RESUMES,
  SIGNATURE,
  type EmailCheck,
  type LinkedinStatus,
  type OutreachStatus,
} from "@/lib/outreach";

export type OutreachData = {
  id: string;
  company: string;
  about: string;
  location: string;
  contactName: string;
  contactInfo: string;
  email: string;
  resume: string;
  subject: string;
  body: string;
  notes: string;
  tier: string;
  batch: string;
  emailCheck: string;
  linkedin: string;
  linkedinStatus: string;
  status: string;
  sentAt: Date | null;
  followUpAt: Date | null;
  hook: string;
  proofTitle: string;
  proofDoc: string;
  proofUrl: string;
  followUpBody: string;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="xs"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-new" /> : <Copy />}
      {label}
    </Button>
  );
}

function OutreachForm({ row, onDone }: { row?: OutreachData; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await saveOutreach(row?.id ?? null, fd);
          if (!result.ok) return setError(result.error);
          onDone();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>Company</Label>
          <Input name="company" required defaultValue={row?.company} autoFocus />
        </label>
        <label>
          <Label>Who</Label>
          <Input name="contactName" defaultValue={row?.contactName} placeholder="Founder or CTO" />
        </label>
        <label>
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={row?.email} placeholder="Only if it's public" />
        </label>
        <label>
          <Label>Resume</Label>
          <Select name="resume" defaultValue={row?.resume ?? "software"} className="w-full">
            {RESUMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>What they do</Label>
          <Input name="about" defaultValue={row?.about} />
        </label>
        <label>
          <Label>Where / stage</Label>
          <Input name="location" defaultValue={row?.location} placeholder="Toronto, YC W26, 2 people" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>Email check</Label>
          <Select name="emailCheck" defaultValue={row?.emailCheck ?? "none"} className="w-full">
            {EMAIL_CHECKS.map((c) => (
              <option key={c} value={c}>
                {EMAIL_CHECK_LABEL[c]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>LinkedIn status</Label>
          <Select name="linkedinStatus" defaultValue={row?.linkedinStatus ?? "none"} className="w-full">
            {LINKEDIN_STATUSES.map((c) => (
              <option key={c} value={c}>
                {LINKEDIN_LABEL[c]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>LinkedIn handle</Label>
          <Input name="linkedin" defaultValue={row?.linkedin} placeholder="ethan-pronev" />
        </label>
        <label>
          <Label>Tier / batch</Label>
          <div className="flex gap-2">
            <Input name="tier" defaultValue={row?.tier} placeholder="Tier" />
            <Input name="batch" defaultValue={row?.batch} placeholder="Batch" className="w-20" />
          </div>
        </label>
      </div>
      <label className="block">
        <Label>Where to reach them</Label>
        <Textarea name="contactInfo" rows={2} defaultValue={row?.contactInfo} placeholder="LinkedIn / X / public email" />
      </label>
      <label className="block">
        <Label>Subject</Label>
        <Input name="subject" defaultValue={row?.subject} />
      </label>
      <label className="block">
        <Label>Email</Label>
        <Textarea name="body" rows={12} defaultValue={row?.body ?? `Hi ,\n\n\n\n${SIGNATURE}`} />
      </label>
      <label className="block">
        <Label>Hook (opener tied to their product)</Label>
        <Textarea name="hook" rows={2} defaultValue={row?.hook} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>Proof-of-work title</Label>
          <Input name="proofTitle" defaultValue={row?.proofTitle} />
        </label>
        <label>
          <Label>Proof-of-work link</Label>
          <Input name="proofUrl" defaultValue={row?.proofUrl} placeholder="Gist or doc URL once published" />
        </label>
      </div>
      <label className="block">
        <Label>Proof-of-work doc</Label>
        <Textarea name="proofDoc" rows={8} defaultValue={row?.proofDoc} />
      </label>
      <label className="block">
        <Label>Follow-up email</Label>
        <Textarea name="followUpBody" rows={6} defaultValue={row?.followUpBody} />
      </label>
      <label className="block">
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} defaultValue={row?.notes} />
      </label>
      {error && <p className="text-xs text-overdue">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function NewOutreachButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        New email
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New cold email">
        <OutreachForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function OutreachCard({ row }: { row: OutreachData }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const status = row.status as OutreachStatus;
  const follow = urgencyOf(row.followUpAt);
  const due = status === "sent" && (follow === "overdue" || follow === "today");
  const set = (s: OutreachStatus) => startTransition(() => setOutreachStatus(row.id, s));
  const cycleLinkedin = () => {
    const i = LINKEDIN_STATUSES.indexOf(row.linkedinStatus as LinkedinStatus);
    const next = LINKEDIN_STATUSES[(i + 1) % LINKEDIN_STATUSES.length];
    startTransition(() => setLinkedinStatus(row.id, next));
  };
  const unsafe = !!row.email && !EMAIL_CHECK_SAFE.includes(row.emailCheck as EmailCheck);
  // Opens a compose window in Outlook on the web (the Waterloo account), not the default mail app.
  const mailto = row.email && !unsafe
    ? `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(row.email)}&subject=${encodeURIComponent(row.subject)}&body=${encodeURIComponent(row.body)}`
    : "";
  const followUpSubject = row.subject ? `Re: ${row.subject}` : `Following up, ${row.company}`;
  const followUpLink = row.email && !unsafe && row.followUpBody
    ? `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(row.email)}&subject=${encodeURIComponent(followUpSubject)}&body=${encodeURIComponent(row.followUpBody)}`
    : "";
  const [showMore, setShowMore] = useState(false);

  return (
    <Card urgency={due ? (follow as "overdue" | "today") : "none"} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{row.company}</p>
          <p className="truncate text-xs text-muted">
            {[row.tier && `${row.tier}${row.batch ? ` · batch ${row.batch}` : ""}`, row.location, row.about].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <Badge variant={row.resume === "hardware" ? "amber" : row.resume === "pm" ? "violet" : "sky"}>{row.resume}</Badge>
        <button
          type="button"
          aria-label="Edit"
          onClick={() => setEditing(true)}
          className="flex size-7 items-center justify-center rounded-md text-muted-2 hover:bg-surface-2 hover:text-text"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <div className="text-sm">
        {row.contactName && <p className="font-medium">{row.contactName}</p>}
        {row.contactInfo && <p className="text-xs whitespace-pre-wrap text-muted">{row.contactInfo}</p>}
        {row.email && (
          <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted">
            {row.email}
            <Badge variant={EMAIL_CHECK_SAFE.includes(row.emailCheck as EmailCheck) ? "emerald" : "amber"}>
              {EMAIL_CHECK_LABEL[row.emailCheck as EmailCheck] ?? row.emailCheck}
            </Badge>
          </p>
        )}
        {row.linkedin && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <a
              href={`https://www.linkedin.com/in/${row.linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              linkedin.com/in/{row.linkedin}
            </a>
            <button
              type="button"
              disabled={isPending}
              onClick={() => cycleLinkedin()}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium hover:text-text"
            >
              {LINKEDIN_LABEL[row.linkedinStatus as LinkedinStatus] ?? row.linkedinStatus}
            </button>
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-2">Subject</p>
        <p className="text-sm">{row.subject || "—"}</p>
      </div>

      <div>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-accent hover:underline">
          {open ? "Hide email" : "Show email"}
        </button>
        {open && <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{row.body}</p>}
      </div>

      {row.hook && (
        <div className="rounded-lg bg-accent/5 p-3 text-sm ring-1 ring-accent/20 ring-inset">
          <p className="text-xs font-medium text-accent">Suggested opener (from public info, check it is true before using)</p>
          <p className="mt-1 whitespace-pre-wrap">{row.hook}</p>
          <div className="mt-2">
            <CopyButton text={row.hook} label="Opener" />
          </div>
        </div>
      )}

      {row.proofDoc && (
        <div>
          <button type="button" onClick={() => setShowMore(!showMore)} className="text-xs font-medium text-accent hover:underline">
            {showMore ? "Hide" : "Show"} proof of work{row.proofTitle ? `: ${row.proofTitle}` : ""}
          </button>
          {row.proofUrl && (
            <a href={row.proofUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-accent hover:underline">
              published
            </a>
          )}
          {showMore && (
            <div className="mt-2 space-y-2">
              <p className="rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{row.proofDoc}</p>
              <CopyButton text={row.proofDoc} label="Doc" />
            </div>
          )}
        </div>
      )}

      {row.followUpBody && status === "sent" && (
        <div className={`rounded-lg p-3 text-sm ring-1 ring-inset ${due ? "bg-urgent/5 ring-urgent/30" : "bg-surface-2 ring-border"}`}>
          <p className="text-xs font-medium text-muted-2">Follow-up draft{due ? " (due now)" : ""}</p>
          <p className="mt-1 whitespace-pre-wrap">{row.followUpBody}</p>
          <div className="mt-2 flex gap-1.5">
            <CopyButton text={row.followUpBody} label="Follow-up" />
            {followUpLink && (
              <a
                href={followUpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-xs font-medium text-text shadow-card ring-1 ring-border-strong ring-inset hover:bg-surface-2 [&_svg]:size-4"
              >
                <Mail />
                Open in Outlook
              </a>
            )}
          </div>
        </div>
      )}

      {row.notes && <p className="text-xs whitespace-pre-wrap text-muted">{row.notes}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <CopyButton text={row.subject} label="Subject" />
        <CopyButton text={row.body} label="Email" />
        {mailto && (
          <a
            href={mailto}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-xs font-medium text-text shadow-card ring-1 ring-border-strong ring-inset hover:bg-surface-2 [&_svg]:size-4"
          >
            <Mail />
            Open in Outlook
          </a>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-2">
        <span>
          {row.sentAt ? `Sent ${formatDate(row.sentAt)}` : "Not sent"}
          {status === "sent" && row.followUpAt && (
            <span className={due ? "font-medium text-urgent" : ""}>
              {" "}
              · <BellRing className="inline size-3" /> follow up {formatDate(row.followUpAt)}
            </span>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {status === "todo" && (
            <Button size="xs" variant="primary" disabled={isPending} onClick={() => set("draft")}>
              Mark drafted
            </Button>
          )}
          {status === "draft" && (
            <Button size="xs" variant="primary" disabled={isPending} onClick={() => set("sent")}>
              Mark sent
            </Button>
          )}
          {status === "sent" && (
            <Button size="xs" variant="secondary" disabled={isPending} onClick={() => set("followed_up")}>
              Followed up
            </Button>
          )}
          {(status === "sent" || status === "followed_up") && (
            <>
              <Button size="xs" variant="secondary" disabled={isPending} onClick={() => set("replied")}>
                Replied
              </Button>
              <Button size="xs" variant="ghost" disabled={isPending} onClick={() => set("passed")}>
                Passed
              </Button>
            </>
          )}
          {(status === "replied" || status === "passed") && (
            <Button size="xs" variant="ghost" disabled={isPending} onClick={() => set("draft")}>
              Back to drafts
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            aria-label="Delete"
            onClick={() => {
              if (confirm(`Delete the email to ${row.company}?`)) startTransition(() => deleteOutreach(row.id));
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit ${row.company}`}>
        <OutreachForm row={row} onDone={() => setEditing(false)} />
      </Dialog>
    </Card>
  );
}
