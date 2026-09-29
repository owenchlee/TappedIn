import Link from "next/link";
import { History } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/** "Show N past/closed" ↔ "Hide past" link for list pages that hide items you can no longer apply to. */
export function PastToggle({ basePath, showPast, hiddenCount }: { basePath: string; showPast: boolean; hiddenCount: number }) {
  if (!showPast && hiddenCount === 0) return null;
  const withPast = `${basePath}${basePath.includes("?") ? "&" : "?"}showPast=1`;
  return (
    <Link href={showPast ? basePath : withPast} scroll={false} className={buttonClasses("ghost", "sm")}>
      <History />
      {showPast ? "Hide past & closed" : `Show ${hiddenCount} past or closed`}
    </Link>
  );
}
