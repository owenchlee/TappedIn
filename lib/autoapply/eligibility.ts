// Owen is Canadian. Postings that require U.S. citizenship or a U.S. security clearance are a dead
// end, and SimplifyJobs' feed doesn't flag them reliably (its "sponsorship" field is "Other" on
// nearly every row), so the runner reads the posting text itself and warns before he spends time.
// Pure module: shared by the runner and the app.

const RULES: { re: RegExp; warning: string }[] = [
  {
    re: /\b(u\.?\s?s\.?|united states)\s+citizen(ship)?\b[^.\n]{0,60}\b(required|is required|must|only)\b|\bmust be (a )?(u\.?\s?s\.?|united states) citizen\b|\brequires? (u\.?\s?s\.?|united states) citizenship\b|\b(u\.?\s?s\.?|united states) citizens? only\b/i,
    warning: "Requires U.S. citizenship",
  },
  {
    re: /\b(active |current |obtain (a|an)? ?|eligib(le|ility) (for|to obtain) (a|an)? ?)(u\.?\s?s\.? )?(government |security |secret |top secret |ts\/sci )+clearance\b|\b(secret|top secret|ts\/sci) clearance\b/i,
    warning: "Needs a U.S. security clearance (citizens only)",
  },
  {
    re: /\b(itar|export control)\b[^.\n]{0,120}\b(u\.?\s?s\.? person|citizen|permanent resident)/i,
    warning: "Export-control rules (ITAR/EAR) limit this to U.S. persons",
  },
  {
    re: /\b(will not|cannot|does not|unable to|no) (provide |offer )?(visa )?sponsor(ship)?\b|\bwithout (the need for )?(current or future )?(visa )?sponsorship\b/i,
    warning: "No visa sponsorship: you'd need your own U.S. work authorization (e.g. TN or J-1)",
  },
];

/** Warnings for postings Owen likely can't take as a Canadian; empty when nothing was found. */
export function eligibilityWarnings(postingText: string): string[] {
  return RULES.filter((r) => r.re.test(postingText)).map((r) => r.warning);
}
