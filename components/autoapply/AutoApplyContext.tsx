"use client";

import { createContext, useContext } from "react";

// Tailoring only works on Owen's machine (pdfLaTeX + the local `claude` CLI), so the shell
// passes AUTO_APPLY_ENABLED down once and every ApplyButton reads it here instead of each page
// threading a prop through client components like JobRow.
const AutoApplyContext = createContext(false);

export const AutoApplyProvider = AutoApplyContext.Provider;

export function useAutoApplyEnabled(): boolean {
  return useContext(AutoApplyContext);
}
