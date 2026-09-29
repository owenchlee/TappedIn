"use client";

import { useTransition } from "react";
import { dismissSignal } from "@/actions/orgs";
import { Button } from "@/components/ui/Button";

export function DismissSignalButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button size="xs" variant="ghost" disabled={isPending} onClick={() => startTransition(() => dismissSignal(id))}>
      Got it
    </Button>
  );
}
