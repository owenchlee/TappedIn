"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { LogOut, Settings } from "lucide-react";
import { isActive, youItems } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { logout } from "@/actions/auth";

/** Round avatar at the top right: your pages (contacts, journey, insights...), settings and theme. */
export function ProfileMenu({ name, autoApply, canSignOut }: { name: string; autoApply: boolean; canSignOut: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = [...youItems({ autoApply }), { href: "/settings", label: "Settings", icon: Settings, hint: "Preferences, backup, calendar link" }];
  const inMenu = items.some((i) => isActive(pathname, i.href));

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
        aria-label="Your profile"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex size-10 items-center justify-center rounded-full bg-text text-sm font-semibold text-bg transition-shadow",
          open || inMenu ? "ring-2 ring-text ring-offset-2 ring-offset-bg" : "hover:ring-2 hover:ring-border-strong hover:ring-offset-2 hover:ring-offset-bg",
        )}
      >
        {name.trim().charAt(0).toUpperCase() || "Y"}
      </button>
      {open && (
        <div className="animate-pop-in absolute top-full right-0 z-30 mt-2 w-72 rounded-3xl border border-border bg-surface p-2 shadow-pop">
          <div className="flex items-center gap-3 px-3 pt-2 pb-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-text text-sm font-semibold text-bg">
              {name.trim().charAt(0).toUpperCase() || "Y"}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-text">{name || "You"}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-border pt-2">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={clsx("flex items-center gap-3 rounded-xl px-3 py-2 transition-colors", active ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <Icon className={clsx("size-4 shrink-0", active ? "text-accent" : "text-muted")} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{item.label}</span>
                    {item.hint && <span className="block truncate text-xs text-muted-2">{item.hint}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border px-3 pt-3 pb-1">
            <span className="text-xs font-medium text-muted">Appearance</span>
            <div className="w-32">
              <ThemeToggle />
            </div>
          </div>
          {canSignOut && (
            <form action={logout} className="mt-1">
              <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text">
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
