import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, safeEqual, sessionToken, sitePassword } from "@/lib/auth";

/**
 * Puts the whole site behind SALESFLOOR_PASSWORD when one is set. With no
 * password configured every request passes straight through, so this is inert
 * until you deploy somewhere public.
 */

/** The GoHighLevel webhook can't log in — it carries its own shared secret. */
const ALWAYS_OPEN = ["/login", "/api/login", "/api/ghl/webhook"];

export async function middleware(req: NextRequest) {
  const password = sitePassword();
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const expected = await sessionToken(password);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (safeEqual(cookie, expected)) return NextResponse.next();

  // An expired session on an API call should read as "log in again", not as a
  // broken endpoint, so JSON callers get a status rather than a login page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own static output, which carries no data.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
