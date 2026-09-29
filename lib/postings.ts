import { prisma } from "@/lib/db";
import { categoryFromTitle, regionForLocation, titleKeyFor, urlKeyFor } from "@/lib/sources/normalize";
import { termsFromText } from "@/lib/terms";

export type ManualPostingInput = {
  company: string;
  role: string;
  url?: string | null;
  location?: string | null;
  deadline?: Date | null;
  notes?: string;
  terms?: string[];
};

/** Normalized facets + dedupe keys for a posting typed in by hand. */
export function manualFacets(input: Pick<ManualPostingInput, "company" | "role" | "url" | "location" | "terms">) {
  return {
    terms: input.terms && input.terms.length > 0 ? input.terms : termsFromText(input.role),
    region: regionForLocation(input.location) ?? null,
    category: categoryFromTitle(input.role),
    urlKey: input.url ? urlKeyFor(input.url) : null,
    titleKey: titleKeyFor(input.company, input.role),
  };
}

/**
 * Creates a manual posting — unless the exact job is already in the database (same application URL, or
 * the same company + role), in which case that row is reused so you never track one job twice.
 */
export async function findOrCreateManualPosting(input: ManualPostingInput): Promise<{ id: string; reused: boolean }> {
  const facets = manualFacets(input);
  const existing = await prisma.coopPosting.findFirst({
    where: {
      duplicateOfId: null,
      OR: [...(facets.urlKey ? [{ urlKey: facets.urlKey }] : []), { titleKey: facets.titleKey }],
    },
    orderBy: { firstSeenAt: "asc" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, reused: true };

  const row = await prisma.coopPosting.create({
    data: {
      company: input.company,
      role: input.role,
      // WaterlooWorks postings have no public link — fall back to the portal so the card still opens somewhere useful.
      url: input.url || "https://waterlooworks.uwaterloo.ca/",
      location: input.location || null,
      deadline: input.deadline ?? null,
      notes: input.notes ?? "",
      origin: "manual",
      status: "open",
      ...facets,
    },
    select: { id: true },
  });
  return { id: row.id, reused: false };
}
