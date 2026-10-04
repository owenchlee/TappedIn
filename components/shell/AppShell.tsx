"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, LayoutGrid, Search, X } from "lucide-react";
import { PRIMARY_NAV, moreSections, isActive, type NavItem } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LogoMark } from "@/components/shell/LogoMark";
import { CommandPalette, openCommandPalette } from "@/components/shell/CommandPalette";
import { AutoApplyProvider } from "@/components/autoapply/AutoApplyContext";
import { LogApplicationButton } from "@/components/applications/LogApplicationButton";

export type NavCounts = { newJobs: number; dueSoon: number; actionable: number };

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full pr-1">
      <LogoMark className="size-8" />
      <span className="text-base font-semibold tracking-tight text-text">TappedIn</span>
    </Link>
  );
}

function CountBadge({ count, tone }: { count?: number; tone: "accent" | "urgent" }) {
  if (count == null || count <= 0) return null;
  return (
    <span
      className={clsx(
        "min-w-5 rounded-full px-1.5 text-center text-[10px] leading-5 font-semibold tabular-nums",
        tone === "urgent" ? "bg-urgent/15 text-urgent" : "bg-accent/15 text-accent",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function TopLink({ item, count }: { item: NavItem; count?: number }) {
  const active = isActive(usePathname(), item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
        active ? "bg-surface text-text shadow-card ring-1 ring-border" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {item.label}
      <CountBadge count={count} tone={item.badgeKey === "dueSoon" ? "urgent" : "accent"} />
    </Link>
  );
}

/** The grouped list of secondary pages, shared by the desktop popover and the mobile sheet. */
function MoreContent({ autoApply, onNavigate }: { autoApply: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {moreSections({ autoApply }).map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-wide text-muted-2 uppercase">{section.label}</p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-start gap-3 rounded-xl px-2 py-2 transition-colors",
                      active ? "bg-accent-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <span className={clsx("flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{item.label}</span>
                      {item.hint && <span className="block text-xs leading-snug text-muted-2">{item.hint}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs font-medium text-muted">Appearance</span>
        <div className="w-36">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function DesktopMore({ autoApply }: { autoApply: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inMore = moreSections({ autoApply }).some((s) => s.items.some((i) => isActive(pathname, i.href)));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-medium transition-colors",
          open || inMore ? "bg-surface text-text shadow-card ring-1 ring-border" : "text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        More
        <ChevronDown className={clsx("size-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-pop-in absolute top-full left-1/2 z-30 mt-2 w-[720px] -translate-x-1/2 rounded-3xl border border-border bg-surface p-5 shadow-pop">
          <MoreContent autoApply={autoApply} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function AppShell({
  children,
  counts,
  autoApply,
  defaultTerm,
}: {
  children: React.ReactNode;
  counts: NavCounts;
  autoApply: boolean;
  defaultTerm: string;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
  }, [sheetOpen]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
            {PRIMARY_NAV.map((item) => (
              <TopLink key={item.href} item={item} count={item.badgeKey ? counts[item.badgeKey] : undefined} />
            ))}
            <DesktopMore autoApply={autoApply} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openCommandPalette}
              aria-label="Search"
              className="flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text md:w-56 md:justify-start md:gap-2 md:border md:border-border md:bg-surface md:px-3.5 md:text-sm md:text-muted-2 md:shadow-card"
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden flex-1 text-left md:inline">Search anything</span>
              <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 font-mono text-[10px] md:inline">Ctrl K</kbd>
            </button>
            <LogApplicationButton defaultTerm={defaultTerm} label="Add" />
          </div>
        </div>
      </header>

      <main id="main" className="px-4 pt-8 pb-32 sm:px-6 lg:pt-12 lg:pb-20">
        <div className="mx-auto max-w-6xl">
          <AutoApplyProvider value={autoApply}>{children}</AutoApplyProvider>
        </div>
      </main>

      {/* Mobile: More sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More pages">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="animate-pop-in absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-pop">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">More</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSheetOpen(false)}
                className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            </div>
            <MoreContent autoApply={autoApply} onNavigate={() => setSheetOpen(false)} />
          </div>
        </div>
      )}

      {/* Mobile: bottom tabs */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        {PRIMARY_NAV.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          const count = tab.badgeKey ? counts[tab.badgeKey] : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={clsx("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-accent" : "text-muted-2")}
            >
              <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent-soft")}>
                <Icon className="size-5" />
              </span>
              {tab.label === "Applications" ? "Apps" : tab.label}
              {count > 0 && <span className="absolute top-2.5 left-1/2 ml-3 size-2 rounded-full bg-accent ring-2 ring-bg" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-2"
        >
          <span className="flex h-7 w-12 items-center justify-center">
            <LayoutGrid className="size-5" />
          </span>
          More
        </button>
      </nav>

      <CommandPalette />
    </div>
  );
}
