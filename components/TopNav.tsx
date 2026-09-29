"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/coop", label: "Co-op" },
  { href: "/design-teams", label: "Design Teams" },
  { href: "/clubs", label: "Clubs" },
  { href: "/hackathons", label: "Hackathons" },
  { href: "/saved", label: "Saved" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-4 py-3">
        <Link href="/" className="mr-2 shrink-0 text-sm font-semibold text-text">
          Coop Hub
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-surface-2 text-text" : "text-muted hover:text-text hover:bg-surface-2",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
