import { Card } from "@/components/ui/Card";
import { clsx } from "clsx";

export function StatCard({ label, value, tone }: { label: string; value: number; tone?: "urgent" }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className={clsx("text-2xl font-semibold", tone === "urgent" && value > 0 ? "text-urgent" : "text-text")}>
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </Card>
  );
}
