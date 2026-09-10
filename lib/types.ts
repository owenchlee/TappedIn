export const COOP_STATUSES = ["open", "closed", "unknown"] as const;
export type CoopStatus = (typeof COOP_STATUSES)[number];

export const ORG_KINDS = ["design_team", "club"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const ORG_STATUSES = ["open", "closed", "rolling", "unknown"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const SAVED_CATEGORIES = ["coop", "design_team", "club"] as const;
export type SavedCategory = (typeof SAVED_CATEGORIES)[number];

export const SAVED_STATUSES = [
  "interested",
  "applied",
  "interview",
  "rejected",
  "accepted",
] as const;
export type SavedStatus = (typeof SAVED_STATUSES)[number];

export const SOURCE_ADAPTERS = [
  "greenhouse",
  "lever",
  "generic-css",
  "generic-json",
] as const;
export type SourceAdapterKey = (typeof SOURCE_ADAPTERS)[number];

export type Urgency = "overdue" | "today" | "urgent" | "soon" | "far" | "none";
