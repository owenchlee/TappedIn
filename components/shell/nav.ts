import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Cpu,
  House,
  KanbanSquare,
  Radar,
  Route,
  Settings,
  Trophy,
  UsersRound,
  UserRound,
  Contact,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badgeKey?: "newJobs" | "dueSoon" | "actionable" };
export type NavSection = { label: string | null; items: NavItem[] };

export function navSections(opts: { autoApply: boolean }): NavSection[] {
  return [
    {
      label: null,
      items: [
        { href: "/", label: "Today", icon: House, badgeKey: "actionable" },
        { href: "/calendar", label: "Calendar", icon: CalendarDays },
      ],
    },
    {
      label: "Discover",
      items: [
        { href: "/jobs", label: "Jobs", icon: Briefcase, badgeKey: "newJobs" },
        { href: "/hackathons", label: "Hackathons", icon: Trophy },
        { href: "/design-teams", label: "Design teams", icon: Cpu },
        { href: "/clubs", label: "Clubs", icon: UsersRound },
      ],
    },
    {
      label: "Track",
      items: [
        { href: "/applications", label: "Applications", icon: KanbanSquare, badgeKey: "dueSoon" },
        { href: "/contacts", label: "Contacts", icon: Contact },
        { href: "/journey", label: "Journey", icon: Route },
        { href: "/insights", label: "Insights", icon: BarChart3 },
        ...(opts.autoApply
          ? [
              { href: "/apply", label: "Auto-apply", icon: Wand2 },
              { href: "/profile", label: "Profile", icon: UserRound },
            ]
          : []),
      ],
    },
    {
      label: "System",
      items: [
        { href: "/sources", label: "Sources", icon: Radar },
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
