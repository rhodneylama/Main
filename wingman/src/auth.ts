import { createHmac } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { safeEqual } from "./live/manager.js";

const COOKIE = "wingman_session";
const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

/** Paths Recall or a health check must reach without the password. */
const OPEN_PATHS = [/^\/login$/, /^\/style\.css$/, /^\/api\/health$/, /^\/api\/recall\//];

function sessionValue(password: string): string {
  return createHmac("sha256", password).update("wingman-session-v1").digest("hex");
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function isSignedIn(req: Request): boolean {
  if (!config.password) return true;
  const cookie = readCookie(req, COOKIE);
  return Boolean(cookie && safeEqual(cookie, sessionValue(config.password)));
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (OPEN_PATHS.some((p) => p.test(req.path)) || isSignedIn(req)) {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) res.status(401).json({ error: "Sign in first." });
  else res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

export function handleLogin(req: Request, res: Response): void {
  const password = String(req.body?.password ?? "");
  const next = safeNext(String(req.body?.next ?? "/"));
  if (!config.password || !safeEqual(password, config.password)) {
    res.redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
    return;
  }
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${sessionValue(config.password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS_S}${secure ? "; Secure" : ""}`,
  );
  res.redirect(next);
}

/** Only same-site paths, so the login page cannot bounce someone elsewhere. */
export function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function loginPage(req: Request, res: Response): void {
  const next = safeNext(String(req.query.next ?? "/")).replace(/"/g, "&quot;");
  const error = req.query.error ? `<p class="error">That password is not right.</p>` : "";
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wingman Sign In</title><link rel="stylesheet" href="/style.css"></head>
<body><main style="max-width:420px">
<h1>Wingman</h1>
<form class="panel" method="post" action="/login">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
<input type="hidden" name="next" value="${next}">
<p><button type="submit">Sign in</button></p>${error}
</form></main></body></html>`);
}
