import { AppShell } from "@/components/shell/AppShell";
import { getNavCounts } from "@/lib/data/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const counts = await getNavCounts();
  return (
    <AppShell counts={counts} autoApply={process.env.AUTO_APPLY_ENABLED === "1"}>
      {children}
    </AppShell>
  );
}
