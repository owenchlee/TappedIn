import { clsx } from "clsx";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-sm text-text",
        "focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
