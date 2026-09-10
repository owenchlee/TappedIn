"use client";

import { useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { createPosting } from "@/actions/coop";

export function AddPostingForm() {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!expanded) {
    return (
      <Button variant="primary" onClick={() => setExpanded(true)}>
        + Add posting
      </Button>
    );
  }

  return (
    <Card className="space-y-3">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              await createPosting(formData);
              formRef.current?.reset();
              setExpanded(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add posting");
            }
          });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input name="company" placeholder="Company" required />
          <Input name="role" placeholder="Role title" required />
        </div>
        <Input name="url" type="url" placeholder="Application link (https://…)" required />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input name="location" placeholder="Location (optional)" />
          <Input name="deadline" type="date" aria-label="Deadline (optional)" />
        </div>
        <Textarea name="notes" placeholder="Notes (optional)" rows={2} />
        {error && <p className="text-xs text-overdue">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setExpanded(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Adding…" : "Add posting"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
