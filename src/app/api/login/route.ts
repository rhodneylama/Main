import { NextRequest } from "next/server";
import { AUTH_COOKIE, sessionToken, sitePassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const password = sitePassword();
  if (!password) return Response.json({ ok: true });

  let submitted = "";
  try {
    ({ password: submitted } = (await req.json()) as { password: string });
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (submitted !== password) {
    return Response.json({ error: "That password is not right." }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    [
      `${AUTH_COOKIE}=${await sessionToken(password)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      // 30 days, so the TV in the corner isn't logged out every morning.
      "Max-Age=2592000",
      req.nextUrl.protocol === "https:" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; "),
  );
  return res;
}
