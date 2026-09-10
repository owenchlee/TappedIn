"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/Select";

export function SortSelect({
  paramName,
  value,
  options,
  label,
}: {
  paramName: string;
  value: string;
  options: { value: string; label: string }[];
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set(paramName, next);
    } else {
      params.delete(paramName);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      {label}
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
