import { clsx } from "clsx";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full resize-none rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted-2",
        "focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
