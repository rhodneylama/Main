import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Resolves credentials from the environment (ANTHROPIC_API_KEY, or an
 * `ant auth login` profile). Never hardcode a key.
 */
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** The prospect's voice. Latency matters here — this is a live conversation. */
export const PROSPECT_MODEL = process.env.PROSPECT_MODEL ?? "claude-opus-5";

/** The coach. Runs once after the call, so quality matters more than speed. */
export const SCORING_MODEL = process.env.SCORING_MODEL ?? "claude-opus-5";

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
