"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Briefcase, CalendarDays, House, KanbanSquare, Menu, Search, X } from "lucide-react";
import { navSections, isActive, type NavItem } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { CommandPalette, openCommandPalette } from "@/components/shell/CommandPalette";
import { AutoApplyProvider } from "@/components/autoapply/AutoApplyContext";

export type NavCounts = { newJobs: number; dueSoon: number; actionable: number };

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-violet text-[13px] font-bold text-accent-fg shadow-card">
        T
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-text">TappedIn</span>
    </Link>
  );
}

function NavLink({ item, count, onNavigate }: { item: NavItem; count?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
        active ? "bg-surface text-text shadow-card ring-1 ring-border" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon className={clsx("size-4 shrink-0", active ? "text-accent" : "text-muted-2 group-hover:text-muted")} />
      <span className="flex-1 truncate">{item.label}</span>
      {count != null && count > 0 && (
        <span
          className={clsx(
            "min-w-5 rounded-full px-1.5 text-center text-[10px] leading-5 font-semibold tabular-nums",
            item.badgeKey === "dueSoon" ? "bg-urgent/15 text-urgent" : "bg-accent/15 text-accent",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function SidebarContent({ counts, autoApply, onNavigate }: { counts: NavCounts; autoApply: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <Logo />
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openCommandPalette();
        }}
        className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-muted-2 shadow-card transition-colors hover:border-border-strong hover:text-muted"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {navSections({ autoApply }).map((section, i) => (
          <div key={section.label ?? i} className="flex flex-col gap-0.5">
            {section.label && <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-2 uppercase">{section.label}</div>}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} count={item.badgeKey ? counts[item.badgeKey] : undefined} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <ThemeToggle />
    </div>
  );
}

const MOBILE_TABS = [
  { href: "/", label: "Today", icon: House },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Apps", icon: KanbanSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

export function AppShell({ children, counts, autoApply }: { children: React.ReactNode; counts: NavCounts; autoApply: boolean }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-border bg-bg-elevated/70 backdrop-blur-xl lg:block">
        <SidebarContent counts={counts} autoApply={autoApply} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search"
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <Search className="size-4.5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="animate-pop-in absolute inset-y-0 left-0 w-72 border-r border-border bg-bg-elevated shadow-pop">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
            <SidebarContent counts={counts} autoApply={autoApply} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="px-4 pt-6 pb-28 sm:px-6 lg:ml-60 lg:px-10 lg:pt-10 lg:pb-16">
        <div className="mx-auto max-w-6xl">
          <AutoApplyProvider value={autoApply}>{children}</AutoApplyProvider>
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {MOBILE_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium", active ? "text-accent" : "text-muted-2")}
            >
              <Icon className="size-5" />
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-2"
        >
          <Menu className="size-5" />
          More
        </button>
      </nav>

      <CommandPalette />
    </div>
  );
}
