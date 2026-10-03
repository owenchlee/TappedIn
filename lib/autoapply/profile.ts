import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PRIVATE_DIR } from "./job";
import type { Profile } from "./profileMap";

// private/profile.json holds the answers auto-apply types into every form. Local-only (gitignored,
// excluded from Vercel uploads), so the Profile page only exists when AUTO_APPLY_ENABLED=1.

export const PROFILE_FILE = path.join(PRIVATE_DIR, "profile.json");

export const EMPTY_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  preferredName: "",
  email: "",
  phone: "",
  city: "",
  province: "",
  country: "",
  postalCode: "",
  addressLine1: "",
  linkedin: "",
  github: "",
  website: "",
  school: "",
  degree: "",
  program: "",
  startDate: "",
  graduationDate: "",
  currentTerm: "",
  authorizedToWorkInCanada: null,
  authorizedToWorkInUS: null,
  requiresSponsorship: null,
  gender: "decline",
  race: "decline",
  veteranStatus: "decline",
  disabilityStatus: "decline",
  pronouns: "",
  howDidYouHear: "",
};

type StoredProfile = Profile & Record<`_${string}`, string>;

function readStored(): Partial<StoredProfile> {
  if (!existsSync(PROFILE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(PROFILE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function readProfile(): Profile {
  const stored = readStored();
  const profile = { ...EMPTY_PROFILE };
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof Profile)[]) {
    if (key in stored) (profile as Record<string, unknown>)[key] = stored[key];
  }
  return profile;
}

/** Atomic write that keeps the file's "_readme"-style comment keys. */
export function writeProfile(profile: Profile): void {
  const comments = Object.fromEntries(Object.entries(readStored()).filter(([k]) => k.startsWith("_")));
  writeFileSync(`${PROFILE_FILE}.tmp`, `${JSON.stringify({ ...comments, ...profile }, null, 2)}\n`);
  renameSync(`${PROFILE_FILE}.tmp`, PROFILE_FILE);
}
