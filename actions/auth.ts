"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, sessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export type LoginState = { error: string | null };

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Only same-site relative paths — never let ?next= bounce the session to another origin.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  // Flat delay blunts online guessing without needing a rate-limit store.
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!(await checkPassword(password))) {
    return { error: "That password isn't right." };
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
