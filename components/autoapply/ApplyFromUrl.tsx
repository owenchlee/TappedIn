"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { startAutoApplyUrl } from "@/actions/apply";

/** Auto-apply to a posting that isn't tracked in Coop Hub: paste its link. */
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
        <Wand2 /> Auto-apply
      </Button>
      {error && <p className="text-sm text-overdue sm:col-span-4">{error}</p>}
    </form>
  );
}
