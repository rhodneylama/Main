/**
 * A single shared password for the whole site, for when Sales Floor is hosted
 * somewhere the public internet can reach.
 *
 * This is deliberately not user accounts. The app has no per-rep login — reps
 * pick their name from a list — so this is a front door, not an identity
 * system: it stops strangers reading your revenue, and that is all it claims
 * to do. Set SALESFLOOR_PASSWORD to turn it on; leave it unset and the site is
 * open, which is only appropriate on a private network.
 */

export const AUTH_COOKIE = "salesfloor_auth";

/** Runs in both the Edge middleware and Node route handlers. */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`salesfloor:v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares in constant time, so the cookie can't be guessed a byte at a time. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sitePassword(): string {
  return process.env.SALESFLOOR_PASSWORD ?? "";
}
