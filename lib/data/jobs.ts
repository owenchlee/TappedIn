import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { dateInputToStorage, storageToDateInput } from "@/lib/deadline";
import { JOB_CATEGORIES, REGIONS, type JobCategory, type Region } from "@/lib/types";
import { termForDate, termSortKey } from "@/lib/terms";
import { HARD_FLAGS } from "@/lib/fit/requirements";

export const PAGE_SIZE = 40;

export type JobFilters = {
  q?: string;
  regions: Region[];
  /** Also include jobs outside those regions whose posting says it sponsors work visas. */
  plusSponsors?: boolean;
  /** Only jobs whose posting says it sponsors work visas. */
  sponsorsOnly?: boolean;
  term?: string;
  category?: JobCategory;
  onlyNew?: boolean;
  hideTracked?: boolean;
  showClosed?: boolean;
  /** Also list jobs you can't apply to (wrong graduating class, PhD-only, U.S. citizens only...). */
  showBlocked?: boolean;
  sort: "best" | "new" | "deadline";
  page: number;
};

export function parseJobFilters(sp: Record<string, string | string[] | undefined>): JobFilters {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const regionParam = str("region");
  // "open": everywhere you can work without a visa, plus jobs abroad that sponsor one.
  // "sponsor": U.S. and international jobs that sponsor.
  const regions: Region[] =
    regionParam === "all"
      ? [...REGIONS]
      : regionParam === "sponsor"
        ? ["us", "intl"]
        : (regionParam === "open" ? "canada,remote" : (regionParam ?? "canada,remote"))
          .split(",")
          .filter((r): r is Region => (REGIONS as readonly string[]).includes(r));
  const category = str("category");
  return {
    q: str("q"),
    regions: regions.length ? regions : ["canada", "remote"],
    plusSponsors: regionParam === "open",
    sponsorsOnly: regionParam === "sponsor",
    term: str("term"),
    category: (JOB_CATEGORIES as readonly string[]).includes(category ?? "") ? (category as JobCategory) : undefined,
    onlyNew: str("new") === "1",
    hideTracked: str("tracked") === "hide",
    showClosed: str("closed") === "1",
    showBlocked: str("blocked") === "1",
    sort: str("sort") === "deadline" ? "deadline" : str("sort") === "new" ? "new" : "best",
    page: Math.max(1, Number(str("page") ?? 1) || 1),
  };
}

/** Jobs with no hard flag. The NOT-hasSome form keeps rows whose flags are empty. */
export const notBlocked: Prisma.CoopPostingWhereInput = { NOT: { flags: { hasSome: [...HARD_FLAGS] } } };

function baseWhere(f: JobFilters, seenAt: Date): Prisma.CoopPostingWhereInput {
  const today = dateInputToStorage(storageToDateInput(new Date()));
  const and: Prisma.CoopPostingWhereInput[] = [{ duplicateOfId: null }];
  if (!f.showClosed) {
    and.push({ NOT: { status: "closed", dismissedAt: { not: null } } });
    and.push({ OR: [{ deadline: null }, { deadline: { gte: new Date(today.getTime() - 12 * 3_600_000) } }] });
  }
  // Region "canada" includes manual postings with no inferred region (WaterlooWorks entries).
  and.push({
    OR: [
      { region: { in: f.regions } },
      ...(f.regions.includes("canada") ? [{ region: null }] : []),
      ...(f.plusSponsors ? [{ flags: { has: "sponsors" } }] : []),
    ],
  });
  if (f.sponsorsOnly) and.push({ flags: { has: "sponsors" } });
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({ OR: [{ company: contains }, { role: contains }, { location: contains }] });
  }
  if (f.term) and.push({ terms: { has: f.term } });
  if (f.category) and.push({ category: f.category });
  if (f.onlyNew) and.push({ firstSeenAt: { gt: seenAt } });
  if (f.hideTracked) and.push({ saved: null });
  if (!f.showBlocked) and.push(notBlocked);
  return { AND: and };
}

const include = {
  saved: { select: { id: true, status: true } },
  duplicates: { select: { sourceKey: true } },
  source: { select: { name: true } },
} satisfies Prisma.CoopPostingInclude;

export type JobRow = Prisma.CoopPostingGetPayload<{ include: typeof include; omit: { details: true } }>;

export async function listJobs(f: JobFilters, seenAt: Date) {
  const where = baseWhere(f, seenAt);
  const orderBy: Prisma.CoopPostingOrderByWithRelationInput[] =
    f.sort === "deadline"
      ? [{ deadline: { sort: "asc", nulls: "last" } }, { firstSeenAt: "desc" }]
      : f.sort === "new"
        ? [{ firstSeenAt: "desc" }, { postedAt: { sort: "desc", nulls: "last" } }]
        : [{ fitScore: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }];

  const [items, total, newCount, blockedCount] = await Promise.all([
    prisma.coopPosting.findMany({ where, include, orderBy, skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.coopPosting.count({ where }),
    prisma.coopPosting.count({ where: baseWhere({ ...f, onlyNew: true }, seenAt) }),
    // How many the eligibility filter is hiding right now, so the page can say so.
    f.showBlocked ? Promise.resolve(0) : prisma.coopPosting.count({ where: { AND: [baseWhere({ ...f, showBlocked: true }, seenAt), { NOT: notBlocked }] } }),
  ]);
  return { items, total, newCount, blockedCount, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Upcoming terms that postings are actually tagged with, soonest first (for the term filter). */
export async function listJobTerms(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ term: string }[]>`
    SELECT DISTINCT unnest("terms") AS term FROM "CoopPosting" WHERE "duplicateOfId" IS NULL`;
  const current = termSortKey(termForDate(new Date()));
  return rows
    .map((r) => r.term)
    .filter((t) => termSortKey(t) >= current)
    .sort((a, b) => termSortKey(a) - termSortKey(b));
}
