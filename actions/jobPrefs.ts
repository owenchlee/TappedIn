"use server";

import { revalidatePath } from "next/cache";
import { validatePrefs } from "@/lib/fit/prefs";
import { rescoreJobs, saveJobPrefs } from "@/lib/fit/store";

export async function saveJobPreferences(_prev: unknown, formData: FormData): Promise<{ ok: true; rescored: number } | { ok: false; error: string }> {
  const skills = String(formData.get("skills") ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const prefs = validatePrefs({
    targetTerms: formData.getAll("targetTerms").map(String),
    categories: formData.getAll("categories").map(String),
    gradYear: Number(formData.get("gradYear")),
    skills: [...new Set(skills)],
  });
  if (!prefs) return { ok: false, error: "Check the graduation year (e.g. 2031) and keep skills under 40 characters each." };
  if (prefs.targetTerms.length === 0) return { ok: false, error: "Pick at least one term." };
  if (prefs.categories.length === 0) return { ok: false, error: "Pick at least one kind of role." };

  await saveJobPrefs(prefs);
  const rescored = await rescoreJobs();
  revalidatePath("/jobs");
  revalidatePath("/");
  return { ok: true, rescored };
}
