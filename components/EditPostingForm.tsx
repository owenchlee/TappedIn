"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { storageToDateInput } from "@/lib/deadline";
import { updatePosting } from "@/actions/coop";
import type { CoopPostingView } from "@/lib/data/coop";

export function EditPostingForm({ posting, onDone }: { posting: CoopPostingView; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updatePosting(posting.id, formData);
          if (result.ok) {
            onDone();
          } else {
            setError(result.error);
          }
        });
      }}
      className="space-y-2 rounded-md bg-surface-2 p-2.5"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input name="company" defaultValue={posting.company} placeholder="Company" required />
        <Input name="role" defaultValue={posting.role} placeholder="Role title" required />
      </div>
      <Input name="url" type="url" defaultValue={posting.url} placeholder="Application link (https://…)" required />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input name="location" defaultValue={posting.location ?? ""} placeholder="Location (optional)" />
        <Input
          name="deadline"
          type="date"
          defaultValue={posting.deadline ? storageToDateInput(posting.deadline) : ""}
          aria-label="Deadline (optional)"
        />
      </div>
      {error && <p className="text-xs text-overdue">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
