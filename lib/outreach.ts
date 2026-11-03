export const OUTREACH_STATUSES = ["todo", "draft", "sent", "followed_up", "replied", "passed"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const STATUS_LABEL: Record<OutreachStatus, string> = {
  todo: "To do",
  draft: "Drafts",
  sent: "Sent",
  followed_up: "Followed up",
  replied: "Replied",
  passed: "Passed",
};

export const RESUMES = ["software", "hardware", "pm"] as const;

/** How sure we are the address won't bounce. Only valid and catch_all are safe to send to. */
export const EMAIL_CHECKS = ["none", "guess", "weak", "valid", "catch_all", "bounced"] as const;
export type EmailCheck = (typeof EMAIL_CHECKS)[number];

export const EMAIL_CHECK_LABEL: Record<EmailCheck, string> = {
  none: "No email",
  guess: "Unverified guess",
  weak: "Weak check",
  valid: "Verified",
  catch_all: "Catch-all domain",
  bounced: "Bounced",
};

export const EMAIL_CHECK_SAFE: readonly EmailCheck[] = ["valid", "catch_all"];

export const LINKEDIN_STATUSES = ["none", "requested", "connected"] as const;
export type LinkedinStatus = (typeof LINKEDIN_STATUSES)[number];

export const LINKEDIN_LABEL: Record<LinkedinStatus, string> = {
  none: "LinkedIn: not sent",
  requested: "LinkedIn: requested",
  connected: "LinkedIn: connected",
};

export const SIGNATURE = `Owen Lee
Portfolio: https://owenchlee.me | GitHub: https://github.com/owenchlee`;

/** Days to wait before the single follow-up. */
export const FOLLOW_UP_DAYS = 7;
