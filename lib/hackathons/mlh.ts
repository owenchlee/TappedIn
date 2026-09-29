import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import { createFetchCtx } from "@/lib/sources/fetchSource";
import { slugify } from "@/lib/format";
import type { HackathonRegion } from "@/lib/types";

export type MlhEvent = {
  name: string;
  url: string;
  start: Date;
  end: Date | null;
  city: string | null;
  region: string | null;
  country: string | null;
  online: boolean;
};

// Roughly a ≤2 hour drive from Waterloo — the same radius as the hand-curated data/hackathons.json.
const NEARBY_CITIES = [
  "waterloo",
  "kitchener",
  "cambridge",
  "guelph",
  "hamilton",
  "burlington",
  "oakville",
  "mississauga",
  "missisauga",
  "brampton",
  "toronto",
  "scarborough",
  "north york",
  "markham",
  "vaughan",
  "richmond hill",
  "london",
  "st. catharines",
  "st catharines",
  "oshawa",
  "brantford",
  "niagara",
];
// US states close enough to be a realistic road trip (Buffalo, Detroit, Ann Arbor, …).
const NEAR_US_STATES = ["new york", "michigan", "ohio", "pennsylvania"];

export function hackathonRegion(e: Pick<MlhEvent, "city" | "region" | "country" | "online">): HackathonRegion | null {
  if (e.online) return "online";
  const city = (e.city ?? "").toLowerCase();
  if (e.country === "CA") return NEARBY_CITIES.some((c) => city.includes(c)) ? "nearby" : "canada";
  if (e.country === "US" && NEAR_US_STATES.includes((e.region ?? "").toLowerCase())) return "us";
  return null;
}

/** MLH season "2027" runs roughly Aug 2026 – Jul 2027. */
export function currentMlhSeason(now: Date = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function parseMlhEvents(html: string): MlhEvent[] {
  const $ = cheerio.load(html);
  const events: MlhEvent[] = [];
  $('[itemtype="https://schema.org/Event"]').each((_, el) => {
    const node = $(el);
    const meta = (prop: string) => node.find(`[itemprop="${prop}"]`).first().attr("content")?.trim() || null;
    const name = node.find("h3, h4").first().text().trim();
    const url = meta("url") ?? node.attr("href") ?? null;
    const start = meta("startDate");
    if (!name || !url || !start) return;
    const end = meta("endDate");
    events.push({
      name,
      url: url.split("?")[0],
      start: new Date(start),
      end: end ? new Date(end) : null,
      city: meta("addressLocality"),
      region: meta("addressRegion"),
      country: meta("addressCountry"),
      online: /Online/i.test(meta("eventAttendanceMode") ?? ""),
    });
  });
  return events;
}

/** UTC noon on the event's Toronto calendar day, matching the app's date-only storage convention. */
function toStorageDay(date: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/\b(20\d{2}|hacks?|hackathon)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type HackathonImportSummary = { ok: boolean; fetched: number; kept: number; created: number; updated: number; error?: string };

/**
 * Imports upcoming MLH hackathons that are nearby, online, elsewhere in Canada, or a short trip into
 * the US. Hackathons already in data/hackathons.json (matched by name or website) are left to the
 * curated entry. Imported rows are keyed by slug, so re-running only refreshes dates and location.
 */
export async function importMlhHackathons(now: Date = new Date()): Promise<HackathonImportSummary> {
  const ctx = createFetchCtx();
  const season = currentMlhSeason(now);
  try {
    const html = await ctx.fetchText(`https://www.mlh.com/seasons/${season}/events`);
    const events = parseMlhEvents(html);
    if (events.length === 0) throw new Error("MLH page parsed to zero events — the page layout probably changed");

    const seeded = await prisma.organization.findMany({
      where: { kind: "hackathon", origin: "seed" },
      select: { name: true, url: true },
    });
    const seededNames = new Set(seeded.map((s) => nameKey(s.name)));
    const seededHosts = new Set(seeded.map((s) => hostKey(s.url)));

    let kept = 0;
    let created = 0;
    let updated = 0;
    for (const e of events) {
      const region = hackathonRegion(e);
      if (!region) continue;
      if ((e.end ?? e.start).getTime() < now.getTime() - 86_400_000) continue; // already over
      if (seededNames.has(nameKey(e.name)) || seededHosts.has(hostKey(e.url))) continue;
      kept++;

      const location = e.online ? "Online" : [e.city, e.region].filter(Boolean).join(", ");
      const startDay = toStorageDay(e.start);
      const slug = `mlh-${slugify(e.name)}-${startDay.toISOString().slice(0, 7)}`;
      const data = {
        name: e.name,
        url: e.url,
        eventStart: startDay,
        eventEnd: e.end ? toStorageDay(e.end) : null,
        location,
        region,
        online: e.online,
        tagsJson: JSON.stringify([region === "nearby" ? "nearby" : region, e.online ? "online" : "in-person", "MLH"]),
        managed: true,
      };
      const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      if (existing) {
        await prisma.organization.update({ where: { slug }, data });
        updated++;
      } else {
        await prisma.organization.create({
          data: { ...data, slug, kind: "hackathon", origin: "mlh", description: "", sortOrder: 1000 },
        });
        created++;
      }
    }

    await prisma.jobState.upsert({
      where: { key: "mlh-hackathons" },
      create: { key: "mlh-hackathons", lastRunAt: now, lastOkAt: now },
      update: { lastRunAt: now, lastOkAt: now, lastError: null },
    });
    return { ok: true, fetched: events.length, kept, created, updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.jobState.upsert({
      where: { key: "mlh-hackathons" },
      create: { key: "mlh-hackathons", lastRunAt: now, lastError: message },
      update: { lastRunAt: now, lastError: message },
    });
    return { ok: false, fetched: 0, kept: 0, created: 0, updated: 0, error: message };
  }
}
