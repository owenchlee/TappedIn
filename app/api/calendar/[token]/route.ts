import { isValidCalendarToken } from "@/lib/auth";
import { getAgenda } from "@/lib/data/agenda";
import { buildIcs } from "@/lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * Subscribable calendar feed (Google Calendar → "From URL", Apple Calendar → "New Calendar
 * Subscription"). Calendar apps can't log in, so the secret lives in the path instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!(await isValidCalendarToken(clean))) {
    return new Response("Not found", { status: 404 });
  }
  const now = Date.now();
  const items = await getAgenda(new Date(now - 60 * DAY), new Date(now + 365 * DAY));
  const origin = new URL(req.url).origin;
  return new Response(buildIcs(items, origin), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tappedin.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
