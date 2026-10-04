"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { startAutoApplyUrl } from "@/actions/apply";

/** Tailor for a posting that isn't in the Jobs list: paste its link (and its text, if the site can't be read). */
export function ApplyFromUrl() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]"
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          try {
            router.push(`/apply/${await startAutoApplyUrl(formData)}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
      }
    >
      <Input name="url" type="url" required placeholder="https://jobs.lever.co/..." aria-label="Posting URL" />
      <Input name="company" placeholder="Company" aria-label="Company" />
      <Input name="role" placeholder="Role" aria-label="Role" />
      <Button type="submit" variant="primary" disabled={isPending}>
        <Wand2 /> Tailor
      </Button>
      <Textarea
        name="description"
        rows={3}
        placeholder="Job description (optional: paste it if the link needs a login or doesn't load)"
        aria-label="Job description"
        className="sm:col-span-4"
      />
      {error && <p className="text-sm text-overdue sm:col-span-4">{error}</p>}
    </form>
  );
}
