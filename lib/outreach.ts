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

export const OUTREACH_KINDS = ["founder", "recruiter", "alum"] as const;
export type OutreachKind = (typeof OUTREACH_KINDS)[number];
export const KIND_LABEL: Record<OutreachKind, string> = { founder: "Founders", recruiter: "Recruiters", alum: "Waterloo alumni" };

type NoteRow = { kind: string; company: string; contactName: string; roleTitle: string; hook: string };
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";

/** The LinkedIn connection note (300 characters at most). Alumni get the learn-first version, which names no company or role. */
export function linkedinNote(r: NoteRow): string {
  const hi = firstName(r.contactName) ? `Hi ${firstName(r.contactName)},` : "Hi,";
  let note: string;
  if (r.kind === "alum") {
    note = `${hi} I'm a first-year Systems Design Engineering student at Waterloo, still figuring out where to take my career. After reading your background I think I could learn a lot from you. Would you be open to a quick call in the coming weeks?`;
  } else if (r.kind === "recruiter") {
    const role = r.roleTitle ? `the ${r.roleTitle} role` : "your internships";
    note = `${hi} I'm a first-year Systems Design Engineering student at Waterloo, applying for ${role} at ${r.company} for May to August 2027. Would love to connect and keep up with ${r.company}'s student hiring.`;
  } else {
    note = `${hi} just sent you an email about part-time dev work at ${r.company}. ${r.hook ? `${r.hook.split(/(?<=[.!?])\s/)[0]} ` : ""}Would love to connect.`;
  }
  return note.length <= 300 ? note : note.slice(0, 297).trimEnd() + "...";
}

const search = (keywords: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
/** LinkedIn people searches, opened by hand: recruiters for student hiring, and Waterloo alumni, at one company. */
export const linkedinSearches = (company: string) => [
  { label: "Find university recruiter", href: search(`university recruiter ${company}`) },
  { label: "Find Waterloo alumni", href: search(`${company} University of Waterloo`) },
];
