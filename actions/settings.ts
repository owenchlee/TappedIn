"use server";

import { setSetting } from "@/lib/data/settings";

export async function markJobsSeen(): Promise<void> {
  // No revalidation on purpose: the badges on the page you're looking at should stay until you
  // navigate, so you can still tell which rows were new.
  await setSetting("jobsSeenAt", new Date().toISOString());
}
