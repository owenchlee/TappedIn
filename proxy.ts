import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except: the login page, token-authenticated APIs (cron, calendar feed), the health
    // check, Next internals, and static files.
    "/((?!login|api/cron|api/calendar|api/health|_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest|.*\\.(?:png|svg|ico|jpg|webp)$).*)",
  ],
};
