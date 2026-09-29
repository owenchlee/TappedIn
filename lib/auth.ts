/**
 * Single-user password gate. The session cookie holds HMAC(AUTH_SECRET, "session:" + APP_PASSWORD), so
 * changing either env var signs everyone out. Web Crypto only, so it runs in proxy.ts as well as Node.
 */
export const SESSION_COOKIE = "tappedin_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

async function hmacHex(message: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** With no APP_PASSWORD configured the gate is off — handy locally, never on a deployment. */
export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export async function sessionToken(): Promise<string> {
  return hmacHex(`session:${process.env.APP_PASSWORD ?? ""}`);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!token) return false;
  return safeEqual(token, await sessionToken());
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  // Compare HMACs rather than raw strings so timing doesn't leak the password length.
  return safeEqual(await hmacHex(`pw:${candidate}`), await hmacHex(`pw:${expected}`));
}

/** Secret path segment for the subscribable calendar feed (calendar apps can't log in). */
export async function calendarToken(): Promise<string> {
  return (await hmacHex("calendar-feed:v1")).slice(0, 32);
}

export async function isValidCalendarToken(token: string): Promise<boolean> {
  return safeEqual(token, await calendarToken());
}
