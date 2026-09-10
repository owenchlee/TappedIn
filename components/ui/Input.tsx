import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted-2",
        "focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
