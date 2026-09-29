import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { dateInputToStorage } from "@/lib/deadline";
import { companySourceSeedFileSchema, orgSeedFileSchema } from "@/lib/seed/schemas";
import type { OrgKind } from "@/lib/types";

async function readJson(relativePath: string): Promise<unknown> {
  const filePath = path.join(/* turbopackIgnore: true */ process.cwd(), relativePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function seedOrgs(relativePath: string, expectedKind: OrgKind): Promise<void> {
  const raw = await readJson(relativePath);
  const parsed = orgSeedFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[seed] Invalid ${relativePath}:`, parsed.error.flatten());
    return;
  }
  const { kind, items } = parsed.data;
  if (kind !== expectedKind) {
    console.error(`[seed] ${relativePath} has kind "${kind}", expected "${expectedKind}" — skipping`);
    return;
  }

  for (const item of items) {
    const shared = {
      name: item.name,
      url: item.url,
      applyUrl: item.applyUrl ?? null,
      description: item.description ?? "",
      tagsJson: JSON.stringify(item.tags),
      sortOrder: item.sortOrder,
      eventStart: item.eventStart ? dateInputToStorage(item.eventStart) : null,
      eventEnd: item.eventEnd ? dateInputToStorage(item.eventEnd) : null,
      managed: true,
    };
    // Only the fields above are ever overwritten on update — applicationStatus, notes, deadline,
    // and lastCheckedAt are the user's own edits and must survive every re-seed.
    await prisma.organization.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, kind, ...shared },
      update: shared,
    });
  }

  const seededSlugs = items.map((i) => i.slug);
  await prisma.organization.updateMany({
    where: { kind, origin: "seed", managed: true, slug: { notIn: seededSlugs } },
    data: { managed: false },
  });
}

async function seedCompanySources(): Promise<void> {
  const raw = await readJson("data/company-sources.json");
  const parsed = companySourceSeedFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[seed] Invalid data/company-sources.json:", parsed.error.flatten());
    return;
  }

  for (const item of parsed.data.sources) {
    const configJson = JSON.stringify({ ...item.config, match: item.match });
    await prisma.companySource.upsert({
      where: { key: item.key },
      create: {
        key: item.key,
        name: item.name,
        careerUrl: item.careerUrl,
        adapter: item.adapter,
        configJson,
        enabled: item.enabled,
      },
      update: {
        name: item.name,
        careerUrl: item.careerUrl,
        adapter: item.adapter,
        configJson,
        // enabled is intentionally never overwritten here — it's a user-controlled runtime toggle.
      },
    });
  }
}

export async function seedAll(): Promise<void> {
  const tasks: [string, () => Promise<void>][] = [
    ["data/design-teams.json", () => seedOrgs("data/design-teams.json", "design_team")],
    ["data/clubs.json", () => seedOrgs("data/clubs.json", "club")],
    ["data/hackathons.json", () => seedOrgs("data/hackathons.json", "hackathon")],
    ["data/company-sources.json", () => seedCompanySources()],
  ];

  for (const [label, task] of tasks) {
    try {
      await task();
    } catch (err) {
      console.error(`[seed] Failed to seed ${label}:`, err);
    }
  }
}
