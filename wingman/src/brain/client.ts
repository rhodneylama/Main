import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Resolves credentials from the environment. Never hardcode a key. */
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Server-side refusal fallbacks are on by default. If this account is not
 * enrolled in that beta the request fails up front, and callers retry once on
 * the stable endpoint instead of losing the pass.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function isBetaUnsupported(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status !== 400 && err.status !== 403 && err.status !== 404) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("beta") || msg.includes("fallback");
}

/** Run the beta attempt, and the stable one only if the beta is unavailable. */
export async function withFallbackRetry<T>(beta: () => Promise<T>, stable: () => Promise<T>): Promise<T> {
  try {
    return await beta();
  } catch (err) {
    if (!isBetaUnsupported(err)) throw err;
    return stable();
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit hit. Skipping this pass.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}. ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
