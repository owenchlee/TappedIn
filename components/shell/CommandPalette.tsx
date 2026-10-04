"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { searchAll, type SearchResult } from "@/actions/search";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PRIMARY_NAV, moreSections } from "@/components/shell/nav";

const OPEN_EVENT = "tappedin:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const PAGES: SearchResult[] = [...PRIMARY_NAV, ...moreSections({ autoApply: false }).flatMap((s) => s.items)].map((item) => ({ id: `p-${item.href}`, kind: "page" as const, title: item.label, subtitle: "Go to page", href: item.href }));

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const open = () => {
      dialogRef.current?.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else open();
      }
    };
    window.addEventListener(OPEN_EVENT, open);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, open);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return; // short queries just don't show results (see `items` below)
    const handle = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchAll(q));
        setActive(0);
      });
    }, 180);
    return () => clearTimeout(handle);
  }, [query]);

  const pageMatches = PAGES.filter((p) => query.trim() === "" || p.title.toLowerCase().includes(query.trim().toLowerCase()));
  const items = [...(query.trim().length >= 2 ? results : []), ...pageMatches];

  function go(item: SearchResult | undefined) {
    if (!item) return;
    dialogRef.current?.close();
    setQuery("");
    router.push(item.href);
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto mt-[12vh] w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text shadow-pop backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        {isPending ? <Loader2 className="size-4 animate-spin text-muted-2" /> : <Search className="size-4 text-muted-2" />}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(items[active]);
            }
          }}
          placeholder="Search jobs, applications, hackathons, people…"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-2"
        />
        <kbd className="rounded border border-border bg-surface-2 px-1.5 font-mono text-[10px] text-muted-2">esc</kbd>
      </div>
      <ul className="max-h-[50vh] overflow-y-auto p-2">
        {items.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted-2">{isPending ? "Searching…" : "No matches"}</li>
        )}
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                i === active ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              {item.logoName ? (
                <CompanyLogo name={item.logoName} url={item.logoUrl} size="sm" />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-md bg-surface-3 text-muted">
                  <ArrowRight className="size-3.5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-2">{item.subtitle}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
