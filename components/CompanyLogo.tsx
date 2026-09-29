"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { companyDomain, monogram, monogramHue } from "@/lib/logo";

const SIZES = { sm: "size-7 text-[10px] rounded-md", md: "size-9 text-xs rounded-lg", lg: "size-12 text-sm rounded-xl" };

export function CompanyLogo({
  name,
  url,
  size = "md",
  className,
}: {
  name: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const domain = companyDomain(url, name);
  const [failed, setFailed] = useState(false);
  const hue = monogramHue(name);

  if (domain && !failed) {
    return (
      <span className={clsx("flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-border", SIZES[size], className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny third-party favicons; next/image adds nothing here */}
        <img
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt=""
          loading="lazy"
          className="size-[70%] object-contain"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // DuckDuckGo serves a 1×1/blank placeholder for some unknown domains.
            if ((e.currentTarget.naturalWidth || 0) <= 1) setFailed(true);
          }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={clsx("flex shrink-0 items-center justify-center font-semibold tracking-tight ring-1 ring-inset", SIZES[size], className)}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55% / 0.22), hsl(${(hue + 40) % 360} 70% 50% / 0.12))`,
        color: `hsl(${hue} 65% 55%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 60% 50% / 0.25)`,
      }}
    >
      {monogram(name)}
    </span>
  );
}
