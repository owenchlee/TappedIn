import { clsx } from "clsx";
import type { SelectHTMLAttributes } from "react";
import { FIELD_CLASSES } from "@/components/ui/Input";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(FIELD_CLASSES, "h-9 w-auto cursor-pointer pr-8", className)} {...props}>
      {children}
    </select>
  );
}
