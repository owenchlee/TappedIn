"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BellRing, Check, Link2, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PersonAvatar } from "@/components/applications/ApplicationContacts";
import { deleteContact, markContacted, saveContact } from "@/actions/contacts";
import { formatDate, storageToDateInput, urgencyOf } from "@/lib/deadline";

type ContactData = {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  linkedin: string;
  notes: string;
  lastContactedAt: Date | null;
  followUpAt: Date | null;
};

function ContactForm({ contact, onDone }: { contact?: ContactData; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await saveContact(contact?.id ?? null, fd);
          if (!result.ok) return setError(result.error);
          onDone();
        });
      }}
    >
      <label className="block">
        <Label>Name</Label>
        <Input name="name" required defaultValue={contact?.name} autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>Role</Label>
          <Input name="role" defaultValue={contact?.role} placeholder="Technical recruiter" />
        </label>
        <label>
          <Label>Company</Label>
          <Input name="company" defaultValue={contact?.company} />
        </label>
        <label>
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={contact?.email} />
        </label>
        <label>
          <Label>LinkedIn</Label>
          <Input name="linkedin" defaultValue={contact?.linkedin} placeholder="https://linkedin.com/in/…" />
        </label>
        <label>
          <Label>Last talked</Label>
          <Input name="lastContactedAt" type="date" defaultValue={contact?.lastContactedAt ? storageToDateInput(contact.lastContactedAt) : ""} />
        </label>
        <label>
          <Label>Follow up on</Label>
          <Input name="followUpAt" type="date" defaultValue={contact?.followUpAt ? storageToDateInput(contact.followUpAt) : ""} />
        </label>
      </div>
      <label className="block">
        <Label>Notes</Label>
        <Textarea name="notes" defaultValue={contact?.notes} rows={3} placeholder="Met at Hack the North, works on payments infra…" />
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

export function NewContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        Add person
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a person">
        <ContactForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function ContactCard({ contact, applications }: { contact: ContactData; applications: { id: string; label: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const followUrgency = urgencyOf(contact.followUpAt);
  const linkedin = contact.linkedin && /^https?:\/\//.test(contact.linkedin) ? contact.linkedin : contact.linkedin ? `https://${contact.linkedin}` : "";

  return (
    <Card urgency={followUrgency === "overdue" || followUrgency === "today" ? followUrgency : "none"} className="flex flex-col gap-3">
      <div id={contact.id} className="flex scroll-mt-24 items-start gap-3">
        <PersonAvatar name={contact.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{contact.name}</p>
          <p className="truncate text-xs text-muted">{[contact.role, contact.company].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <div className="flex items-center gap-0.5">
          {contact.email && (
            <a href={`mailto:${contact.email}`} aria-label="Email" className="flex size-7 items-center justify-center rounded-md text-muted-2 hover:bg-surface-2 hover:text-text">
              <Mail className="size-3.5" />
            </a>
          )}
          {linkedin && (
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="flex size-7 items-center justify-center rounded-md text-muted-2 hover:bg-surface-2 hover:text-text"
            >
              <Link2 className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            aria-label="Edit"
            onClick={() => setEditing(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-2 hover:bg-surface-2 hover:text-text"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      {contact.notes && <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted">{contact.notes}</p>}

      {applications.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {applications.map((a) => (
            <Link key={a.id} href={`/applications/${a.id}`}>
              <Badge className="hover:ring-border-strong">{a.label}</Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-2">
        <span>
          {contact.lastContactedAt ? `Talked ${formatDate(contact.lastContactedAt)}` : "Never contacted"}
          {contact.followUpAt && (
            <span className={followUrgency === "overdue" || followUrgency === "today" ? "font-medium text-urgent" : ""}>
              {" "}
              · <BellRing className="inline size-3" /> {formatDate(contact.followUpAt)}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="ghost" disabled={isPending} onClick={() => startTransition(() => markContacted(contact.id))}>
            <Check />
            Talked today
          </Button>
          <Button
            size="xs"
            variant="ghost"
            aria-label="Delete"
            onClick={() => {
              if (confirm(`Delete ${contact.name}?`)) startTransition(() => deleteContact(contact.id));
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit ${contact.name}`}>
        <ContactForm contact={contact} onDone={() => setEditing(false)} />
      </Dialog>
    </Card>
  );
}
