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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "newJobs" | "dueSoon" | "actionable";
  /** One line shown under the label in the More menu. */
  hint?: string;
};
export type NavSection = { label: string; items: NavItem[] };

/** The few places you go every day — always visible. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House, badgeKey: "actionable" },
  { href: "/jobs", label: "Jobs", icon: Briefcase, badgeKey: "newJobs" },
  { href: "/applications", label: "Applications", icon: KanbanSquare, badgeKey: "dueSoon" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

/** Your own pages, in the profile menu (the avatar at the top right). */
export function youItems(opts: { autoApply: boolean }): NavItem[] {
  return [
    { href: "/contacts", label: "Contacts", icon: Contact, hint: "Recruiters and referrers" },
    { href: "/journey", label: "Journey", icon: Route, hint: "Your five years, term by term" },
    { href: "/insights", label: "Insights", icon: BarChart3, hint: "How your search is going" },
    ...(opts.autoApply
      ? [
          { href: "/apply", label: "Auto-apply", icon: Wand2, hint: "Fill applications for you" },
          { href: "/profile", label: "Profile", icon: UserRound, hint: "Answers used to auto-fill" },
        ]
      : []),
  ];
}

/** Everything else, tucked under "More". */
export function moreSections(): NavSection[] {
  return [
    {
      label: "Explore",
      items: [
        { href: "/hackathons", label: "Hackathons", icon: Trophy, hint: "Upcoming events nearby" },
        { href: "/design-teams", label: "Design teams", icon: Cpu, hint: "Student teams recruiting" },
        { href: "/clubs", label: "Clubs", icon: UsersRound, hint: "Clubs worth joining" },
      ],
    },
    {
      label: "Setup",
      items: [
        { href: "/sources", label: "Sources", icon: Radar, hint: "Where jobs come from" },
        { href: "/settings", label: "Settings", icon: Settings, hint: "Preferences, backup, calendar link" },
      ],
    },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
