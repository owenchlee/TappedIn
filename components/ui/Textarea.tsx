import { clsx } from "clsx";
import type { TextareaHTMLAttributes } from "react";
import { FIELD_CLASSES } from "@/components/ui/Input";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(FIELD_CLASSES, "min-h-16 resize-none py-2", className)} {...props} />;
}
