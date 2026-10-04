import type { LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong bg-surface/60 px-6 py-16 text-center">
      {Icon && (
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-base font-semibold text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
