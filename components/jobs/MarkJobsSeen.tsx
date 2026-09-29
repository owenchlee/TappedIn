"use client";

import { useEffect } from "react";
import { markJobsSeen } from "@/actions/settings";

/** After a few seconds on the Jobs page, everything currently listed stops counting as "new". */
export function MarkJobsSeen() {
  useEffect(() => {
    const handle = setTimeout(() => void markJobsSeen(), 4000);
    return () => clearTimeout(handle);
  }, []);
  return null;
}
