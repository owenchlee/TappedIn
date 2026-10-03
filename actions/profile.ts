"use server";

import { revalidatePath } from "next/cache";
import { EMPTY_PROFILE, readProfile, writeProfile } from "@/lib/autoapply/profile";
import type { Profile } from "@/lib/autoapply/profileMap";

const TRI_STATE = ["authorizedToWorkInCanada", "authorizedToWorkInUS", "requiresSponsorship"] as const;
const SELF_ID = ["gender", "race", "veteranStatus", "disabilityStatus"] as const;
const MONTHS = ["startDate", "graduationDate"] as const;
const URLS = ["linkedin", "github", "website"] as const;

export async function saveProfile(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.AUTO_APPLY_ENABLED !== "1") return { ok: false, error: "Your profile can only be edited when running locally." };

  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const next: Profile = { ...readProfile() };
  const out = next as Record<string, unknown>;

  for (const key of Object.keys(EMPTY_PROFILE) as (keyof Profile)[]) {
    if ((TRI_STATE as readonly string[]).includes(key)) {
      const v = str(key);
      out[key] = v === "yes" ? true : v === "no" ? false : null;
    } else if ((SELF_ID as readonly string[]).includes(key)) {
      out[key] = str(key) || "decline"; // blank means "prefer not to say"
    } else {
      out[key] = str(key);
    }
  }

  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return { ok: false, error: "That email doesn't look right." };
  for (const key of MONTHS) {
    if (next[key] && !/^\d{4}-\d{2}$/.test(next[key])) return { ok: false, error: `Use a month for ${key === "startDate" ? "the start date" : "graduation"}.` };
  }
  for (const key of URLS) {
    if (next[key] && !/^https?:\/\//i.test(next[key])) out[key] = `https://${next[key]}`;
  }

  writeProfile(next);
  revalidatePath("/profile");
  return { ok: true };
}
