"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { markChecked } from "@/actions/orgs";

export function CheckNowButton({ id, url }: { id: string; url: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={isPending}
      onClick={() => {
        window.open(url, "_blank", "noopener,noreferrer");
        startTransition(() => markChecked(id));
      }}
    >
      Check now
    </Button>
  );
}
