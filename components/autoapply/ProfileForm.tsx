"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { saveProfile } from "@/actions/profile";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SectionTitle } from "@/components/ui/PageHeader";
import type { Profile } from "@/lib/autoapply/profileMap";

type TextKey = { [K in keyof Profile]: Profile[K] extends string ? K : never }[keyof Profile];
type TextField = { key: TextKey; label: string; type?: string; placeholder?: string; hint?: string; wide?: boolean };

const SECTIONS: { title: string; note?: string; fields: TextField[] }[] = [
  {
    title: "About you",
    fields: [
      { key: "firstName", label: "Legal first name" },
      { key: "lastName", label: "Legal last name" },
      { key: "preferredName", label: "Preferred name" },
      { key: "pronouns", label: "Pronouns", placeholder: "he/him", hint: "Optional" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel", placeholder: "(416) 555-0123" },
      { key: "addressLine1", label: "Street address", placeholder: "123 Main St, Apt 4", wide: true },
      { key: "city", label: "City" },
      { key: "province", label: "Province / state" },
      { key: "postalCode", label: "Postal code", placeholder: "N2L 3G1" },
      { key: "country", label: "Country" },
    ],
  },
  {
    title: "Links",
    fields: [
      { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/in/…" },
      { key: "github", label: "GitHub", type: "url" },
      { key: "website", label: "Website / portfolio", type: "url" },
    ],
  },
  {
    title: "Education",
    fields: [
      { key: "school", label: "School" },
      { key: "degree", label: "Degree" },
      { key: "program", label: "Program" },
      { key: "startDate", label: "Started", type: "month" },
      { key: "graduationDate", label: "Expected graduation", type: "month" },
    ],
  },
];

const TERMS = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B"];

const ELIGIBILITY: { key: "authorizedToWorkInCanada" | "authorizedToWorkInUS" | "requiresSponsorship"; label: string }[] = [
  { key: "authorizedToWorkInCanada", label: "Legally authorized to work in Canada?" },
  { key: "authorizedToWorkInUS", label: "Legally authorized to work in the US?" },
  { key: "requiresSponsorship", label: "Will you need visa sponsorship?" },
];

const SELF_ID: { key: "gender" | "race" | "veteranStatus" | "disabilityStatus"; label: string; placeholder: string }[] = [
  { key: "gender", label: "Gender", placeholder: "e.g. Male" },
  { key: "race", label: "Race / ethnicity", placeholder: "e.g. East Asian" },
  { key: "veteranStatus", label: "Veteran status", placeholder: "e.g. I am not a veteran" },
  { key: "disabilityStatus", label: "Disability status", placeholder: "e.g. No" },
];

const triValue = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");

/** Blank answers auto-apply would otherwise have to leave for you (pronouns and self-ID are optional). */
function missing(p: Profile): string[] {
  const out: string[] = [];
  for (const s of SECTIONS) for (const f of s.fields) if (f.key !== "pronouns" && !p[f.key]) out.push(f.label);
  for (const e of ELIGIBILITY) if (p[e.key] == null) out.push(e.label.replace(/\?$/, ""));
  if (!p.currentTerm) out.push("Current term");
  return out;
}

export function ProfileForm({ profile: initial }: { profile: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const blanks = missing(profile);
  const set = (key: keyof Profile, value: string | boolean | null) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setDirty(true);
    setState("idle");
  };

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await saveProfile(fd);
          if (result.ok) {
            setState("saved");
            setDirty(false);
            setError(null);
          } else {
            setState("error");
            setError(result.error);
          }
        });
      }}
    >
      <p className={clsx("rounded-lg px-3 py-2 text-sm", blanks.length ? "bg-amber/12 text-amber" : "bg-emerald/12 text-emerald")}>
        {blanks.length
          ? `${blanks.length} blank: ${blanks.join(", ")}. Auto-apply leaves these questions for you to answer on each form.`
          : "All set. Auto-apply can answer every standard question from here."}
      </p>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          <Card className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((f) => (
              <label key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                <Label>
                  {f.label}
                  {!profile[f.key] && f.key !== "pronouns" && <span className="ml-1.5 text-amber">· blank</span>}
                  {f.hint && <span className="ml-1.5 font-normal text-muted-2">{f.hint}</span>}
                </Label>
                <Input name={f.key} type={f.type ?? "text"} value={profile[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            ))}
            {section.title === "Education" && (
              <label>
                <Label>
                  Current term
                  {!profile.currentTerm && <span className="ml-1.5 text-amber">· blank</span>}
                </Label>
                <Select name="currentTerm" value={profile.currentTerm} onChange={(e) => set("currentTerm", e.target.value)} className="w-full">
                  <option value="">Select…</option>
                  {TERMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </Card>
        </section>
      ))}

      <section>
        <SectionTitle>Work eligibility</SectionTitle>
        <Card className="space-y-3">
          <p className="text-xs text-muted">Auto-apply never guesses these. &ldquo;Ask me each time&rdquo; leaves the question blank on every form.</p>
          {ELIGIBILITY.map((e) => (
            <label key={e.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text">{e.label}</span>
              <Select name={e.key} value={triValue(profile[e.key])} onChange={(ev) => set(e.key, ev.target.value === "yes" ? true : ev.target.value === "no" ? false : null)} className="w-44">
                <option value="">Ask me each time</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </label>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>Voluntary self-identification</SectionTitle>
        <Card className="space-y-3">
          <p className="text-xs text-muted">Optional. Leave a field blank to answer &ldquo;prefer not to say&rdquo; on every form.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SELF_ID.map((f) => (
              <label key={f.key}>
                <Label>{f.label}</Label>
                <Input
                  name={f.key}
                  value={profile[f.key] === "decline" ? "" : profile[f.key]}
                  placeholder={`Prefer not to say (${f.placeholder})`}
                  onChange={(e) => set(f.key, e.target.value || "decline")}
                />
              </label>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Defaults</SectionTitle>
        <Card>
          <label>
            <Label>&ldquo;How did you hear about us?&rdquo; when there&apos;s no better option</Label>
            <Input name="howDidYouHear" value={profile.howDidYouHear} placeholder="Company careers page" onChange={(e) => set("howDidYouHear", e.target.value)} />
          </label>
        </Card>
      </section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-border bg-surface/90 px-4 py-3 shadow-card backdrop-blur">
        {state === "error" && <p className="mr-auto text-sm text-overdue">{error}</p>}
        {state === "saved" && (
          <p className="mr-auto flex items-center gap-1.5 text-sm text-emerald">
            <Check className="size-4" /> Saved
          </p>
        )}
        {dirty && state === "idle" && <p className="mr-auto text-sm text-muted">Unsaved changes</p>}
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />} Save profile
        </Button>
      </div>
    </form>
  );
}
