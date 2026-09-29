import type { RawPosting, SourceMatch } from "@/lib/sources/types";

function testPattern(pattern: string | undefined, value: string | undefined): boolean | null {
  if (!pattern) return null;
  return new RegExp(pattern, "i").test(value ?? "");
}

export function applyMatch(postings: RawPosting[], match: SourceMatch | undefined): RawPosting[] {
  if (!match) return postings;

  return postings.filter((posting) => {
    const includeTitle = testPattern(match.includeTitle, posting.title);
    if (includeTitle === false) return false;

    const excludeTitle = testPattern(match.excludeTitle, posting.title);
    if (excludeTitle === true) return false;

    const includeLocation = testPattern(match.includeLocation, posting.location);
    if (includeLocation === false) return false;

    if (match.regions && match.regions.length > 0) {
      if (!posting.region || !match.regions.includes(posting.region)) return false;
    }

    return true;
  });
}
