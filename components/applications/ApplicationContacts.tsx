"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Link2, Mail, Plus, X } from "lucide-react";
import { linkContact, unlinkContact } from "@/actions/applications";
import { saveContact } from "@/actions/contacts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { monogram, monogramHue } from "@/lib/logo";

type Linked = { id: string; name: string; role: string; company: string; email: string; linkedin: string };

export function PersonAvatar({ name }: { name: string }) {
  const hue = monogramHue(name);
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{ background: `hsl(${hue} 70% 55% / 0.18)`, color: `hsl(${hue} 60% 55%)` }}
    >
      {monogram(name)}
    </span>
  );
}

export function ApplicationContacts({
  savedId,
  company,
  linked,
  all,
}: {
  savedId: string;
  company: string;
  linked: Linked[];
  all: { id: string; name: string; company: string }[];
}) {
  const [mode, setMode] = useState<"idle" | "new" | "link">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const linkable = all.filter((c) => !linked.some((l) => l.id === c.id));

  return (
    <Card className="space-y-3">
      {linked.length === 0 && mode === "idle" && <p className="text-xs text-muted-2">Recruiters, referrers, interviewers — anyone worth remembering.</p>}
      {linked.map((c) => (
        <div key={c.id} className="group flex items-center gap-2.5">
          <PersonAvatar name={c.name} />
          <div className="min-w-0 flex-1">
            <Link href={`/contacts#${c.id}`} className="block truncate text-sm font-medium hover:underline">
              {c.name}
            </Link>
            <p className="truncate text-xs text-muted-2">{[c.role, c.company].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          {c.email && (
            <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} className="text-muted-2 hover:text-text">
              <Mail className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            aria-label={`Unlink ${c.name}`}
            onClick={() => startTransition(() => unlinkContact(savedId, c.id))}
            className="text-muted-2 opacity-0 group-hover:opacity-100 hover:text-overdue focus:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}

      {mode === "new" && (
        <form
          className="space-y-2 rounded-lg bg-surface-2/60 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await saveContact(null, fd, savedId);
              if (!result.ok) return setError(result.error);
              setMode("idle");
              setError(null);
            });
          }}
        >
          <Input name="name" placeholder="Name" required autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Input name="role" placeholder="Role (Recruiter)" />
            <Input name="company" placeholder="Company" defaultValue={company} />
          </div>
          <Input name="email" type="email" placeholder="Email" />
          <Input name="linkedin" placeholder="LinkedIn URL" />
          {error && <p className="text-xs text-overdue">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <Button size="xs" type="submit" variant="primary" disabled={isPending}>
              Add person
            </Button>
          </div>
        </form>
      )}

      {mode === "link" && (
        <div className="flex gap-2">
          <Select
            defaultValue=""
            className="flex-1"
            onChange={(e) => {
              if (!e.target.value) return;
              const id = e.target.value;
              startTransition(async () => {
                await linkContact(savedId, id);
                setMode("idle");
              });
            }}
          >
            <option value="">Choose someone…</option>
            {linkable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` (${c.company})` : ""}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-2">
          <Button size="xs" variant="secondary" onClick={() => setMode("new")}>
            <Plus />
            New person
          </Button>
          {linkable.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setMode("link")}>
              <Link2 />
              Link existing
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
