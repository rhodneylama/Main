import Anthropic from "@anthropic-ai/sdk";
import { nonEmpty } from "./env";

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
export const PROSPECT_MODEL = nonEmpty(process.env.PROSPECT_MODEL) ?? "claude-opus-5";

/** The coach. Runs once after the call, so quality matters more than speed. */
export const SCORING_MODEL = nonEmpty(process.env.SCORING_MODEL) ?? "claude-opus-5";

/**
 * The placeholder from .env.example. Hosting dashboards that import that file
 * copy it in verbatim, and a fake key that looks real turns "no key set" into
 * a confusing 401 from the API much later on.
 */
const PLACEHOLDER_KEY = "sk-ant-...";

export function hasCredentials(): boolean {
  const key = nonEmpty(process.env.ANTHROPIC_API_KEY);
  return Boolean((key && key !== PLACEHOLDER_KEY) || nonEmpty(process.env.ANTHROPIC_AUTH_TOKEN));
}
