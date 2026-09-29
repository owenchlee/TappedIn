export const COOP_STATUSES = ["open", "closed", "unknown"] as const;
export type CoopStatus = (typeof COOP_STATUSES)[number];

export const ORG_KINDS = ["design_team", "club", "hackathon"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const ORG_STATUSES = ["open", "closed", "rolling", "unknown"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const SAVED_CATEGORIES = ["coop", "design_team", "club", "hackathon"] as const;
export type SavedCategory = (typeof SAVED_CATEGORIES)[number];

/** Every application stage, in pipeline order. Each category only uses a subset (see STAGES_BY_CATEGORY). */
export const SAVED_STATUSES = [
  "interested",
  "applied",
  "oa",
  "interview",
  "offer",
  "accepted",
  "attended",
  "rejected",
  "ghosted",
  "withdrawn",
] as const;
export type SavedStatus = (typeof SAVED_STATUSES)[number];

export const STAGES_BY_CATEGORY: Record<SavedCategory, readonly SavedStatus[]> = {
  coop: ["interested", "applied", "oa", "interview", "offer", "accepted", "rejected", "ghosted", "withdrawn"],
  design_team: ["interested", "applied", "interview", "accepted", "rejected", "ghosted", "withdrawn"],
  club: ["interested", "applied", "interview", "accepted", "rejected", "withdrawn"],
  hackathon: ["interested", "applied", "accepted", "attended", "rejected", "withdrawn"],
};

/** Stages where the application is still in play (shown as board columns). */
export const ACTIVE_STAGES = ["interested", "applied", "oa", "interview", "offer"] as const satisfies readonly SavedStatus[];
/** Terminal stages — collapsed into one "Closed out" lane on the board. */
export const CLOSED_STAGES = ["accepted", "attended", "rejected", "ghosted", "withdrawn"] as const satisfies readonly SavedStatus[];

export function stageLabel(status: string, category?: SavedCategory): string {
  if (status === "accepted" && category === "club") return "Joined";
  if (status === "accepted" && category === "design_team") return "Joined";
  return STAGE_LABELS[status as SavedStatus] ?? status;
}

export const STAGE_LABELS: Record<SavedStatus, string> = {
  interested: "Saved",
  applied: "Applied",
  oa: "OA",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  attended: "Attended",
  rejected: "Rejected",
  ghosted: "Ghosted",
  withdrawn: "Withdrawn",
};

export const CHANNELS = ["waterlooworks", "direct", "referral", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  waterlooworks: "WaterlooWorks",
  direct: "Company site",
  referral: "Referral",
  other: "Other",
};

export const EVENT_TYPES = ["stage", "oa", "interview", "offer", "follow_up", "note"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_LABELS: Record<EventType, string> = {
  stage: "Stage change",
  oa: "Online assessment",
  interview: "Interview",
  offer: "Offer",
  follow_up: "Follow-up",
  note: "Note",
};

export const REGIONS = ["canada", "remote", "us", "intl"] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  canada: "Canada",
  remote: "Remote",
  us: "US",
  intl: "International",
};

export const JOB_CATEGORIES = ["software", "hardware", "ai_data", "quant", "product", "other"] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];
export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  software: "Software",
  hardware: "Hardware",
  ai_data: "AI / Data",
  quant: "Quant",
  product: "Product",
  other: "Other",
};

export const HACKATHON_REGIONS = ["nearby", "online", "canada", "us"] as const;
export type HackathonRegion = (typeof HACKATHON_REGIONS)[number];

export const SOURCE_ADAPTERS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "simplify",
  "markdown-table",
  "generic-css",
  "generic-json",
] as const;
export type SourceAdapterKey = (typeof SOURCE_ADAPTERS)[number];

export const TERM_KINDS = ["study", "work", "off"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export type Urgency = "overdue" | "today" | "urgent" | "soon" | "far" | "none";
