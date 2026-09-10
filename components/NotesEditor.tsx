"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { saveNotes } from "@/actions/notes";

type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesEditor({ kind, id, initialNotes }: { kind: "coop" | "org"; id: string; initialNotes: string }) {
  const [expanded, setExpanded] = useState(Boolean(initialNotes));
  const [value, setValue] = useState(initialNotes);
  const [state, setState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialNotes);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function flush(next: string) {
    if (next === lastSavedRef.current) return;
    setState("saving");
    startTransition(async () => {
      try {
        await saveNotes(kind, id, next);
        lastSavedRef.current = next;
        setState("saved");
      } catch {
        setState("error");
      }
    });
  }

  function scheduleSave(next: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => flush(next), 600);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs text-muted hover:text-text hover:underline"
      >
        + Add notes
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        placeholder="Notes…"
        rows={2}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave(e.target.value);
        }}
        onBlur={(e) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          flush(e.target.value);
        }}
        className="text-xs"
      />
      <div className="h-3 text-right text-[11px] text-muted-2">
        {state === "saving" && "Saving…"}
        {state === "saved" && "Saved"}
        {state === "error" && (
          <button type="button" onClick={() => flush(value)} className="text-overdue hover:underline">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
