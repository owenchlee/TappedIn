import { z } from "zod";
import { ORG_KINDS, SOURCE_ADAPTERS } from "@/lib/types";

export const orgSeedItemSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  applyUrl: z.string().trim().url().optional(),
  description: z.string().trim().optional(),
  tags: z.array(z.string()).default([]),
  sortOrder: z.number().default(0),
});
export type OrgSeedItem = z.infer<typeof orgSeedItemSchema>;

export const orgSeedFileSchema = z.object({
  version: z.number(),
  kind: z.enum(ORG_KINDS),
  items: z.array(orgSeedItemSchema),
});
export type OrgSeedFile = z.infer<typeof orgSeedFileSchema>;

export const sourceMatchSchema = z.object({
  includeTitle: z.string().optional(),
  excludeTitle: z.string().optional(),
  includeLocation: z.string().optional(),
});

export const companySourceSeedItemSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  careerUrl: z.string().trim().url(),
  adapter: z.enum(SOURCE_ADAPTERS),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
  match: sourceMatchSchema.optional(),
});
export type CompanySourceSeedItem = z.infer<typeof companySourceSeedItemSchema>;

export const companySourceSeedFileSchema = z.object({
  version: z.number(),
  sources: z.array(companySourceSeedItemSchema),
});
export type CompanySourceSeedFile = z.infer<typeof companySourceSeedFileSchema>;
