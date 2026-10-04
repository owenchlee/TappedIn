"use client";

import { useSyncExternalStore } from "react";
import { clsx } from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "system") delete root.dataset.theme;
  else root.dataset.theme = next;
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "system", icon: Monitor, label: "System" },
  { value: "dark", icon: Moon, label: "Dark" },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-0.5 rounded-full border border-border bg-surface-2 p-[3px]">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => applyTheme(value)}
          className={clsx(
            "flex h-8 items-center justify-center rounded-full transition-colors",
            theme === value ? "bg-surface text-text shadow-card" : "text-muted-2 hover:text-muted",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
