"use client";

import { useTransition } from "react";
import { setStage } from "@/actions/applications";
import { Button } from "@/components/ui/Button";

export function StageButton({ id, status, children }: { id: string; status: string; children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button size="xs" variant="ghost" disabled={isPending} onClick={() => startTransition(() => setStage(id, status))}>
      {children}
    </Button>
  );
}
