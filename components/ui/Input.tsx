import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

export const FIELD_CLASSES =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-muted-2 shadow-card transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(FIELD_CLASSES, "h-9", className)} {...props} />;
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx("mb-1 block text-xs font-medium text-muted", className)}>{children}</span>;
}
