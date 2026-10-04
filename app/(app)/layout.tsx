import { AppShell } from "@/components/shell/AppShell";
import { getNavCounts } from "@/lib/data/nav";
import { nextTerm, termForDate } from "@/lib/terms";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const counts = await getNavCounts();
  // Co-op recruiting for a term happens the term before it.
  const defaultTerm = nextTerm(termForDate(new Date()));
  return (
    <AppShell counts={counts} autoApply={process.env.AUTO_APPLY_ENABLED === "1"} defaultTerm={defaultTerm}>
      {children}
    </AppShell>
  );
}
