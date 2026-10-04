"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { FIELD_CLASSES } from "@/components/ui/Input";
import { clsx } from "clsx";

/** Debounced text filter synced to ?q= in the URL. */
export function SearchBox({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams.get(param) ?? "";
  const [value, setValue] = useState(initial);
  const [syncedInitial, setSyncedInitial] = useState(initial);
  // The URL changed from elsewhere (back button, a link) — adopt it. Done during render, not in an effect.
  if (initial !== syncedInitial) {
    setSyncedInitial(initial);
    setValue(initial);
  }

  useEffect(() => {
    if (value === initial) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set(param, value.trim());
      else params.delete(param);
      params.delete("page");
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [value, initial, param, pathname, router, searchParams]);

  return (
    <div className={clsx("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-2" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={clsx(FIELD_CLASSES, "h-10 w-full rounded-full pr-9 pl-10")}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => setValue("")}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-2 hover:bg-surface-2 hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
