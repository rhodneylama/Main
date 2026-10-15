import "dotenv/config";

/** Blank values in a hosting dashboard count as unset. */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

function effort(value: string | undefined, fallback: Effort): Effort {
  return (EFFORTS as readonly string[]).includes(value ?? "") ? (value as Effort) : fallback;
}

export const config = {
  model: env("WINGMAN_MODEL") ?? "claude-sonnet-5-5",
  liveEffort: effort(env("WINGMAN_LIVE_EFFORT"), "low"),
  intervalMs: Number(env("WINGMAN_INTERVAL_SECONDS") ?? 12) * 1000,
  repNames: list(env("WINGMAN_REP_NAMES")),
  research: env("WINGMAN_RESEARCH") !== "false",
  dbPath: env("WINGMAN_DB_PATH") ?? "./data/wingman.db",
  samplesDir: env("WINGMAN_SAMPLES_DIR") ?? "../samples",
  port: Number(env("PORT") ?? 3001),

  /** Leave blank only when running on your own machine. */
  password: env("WINGMAN_PASSWORD"),

  recallApiKey: env("RECALL_API_KEY"),
  recallRegion: env("RECALL_REGION") ?? "us-west-2",
  /** Overrides the region address entirely. Only needed for testing. */
  recallApiBase: env("RECALL_API_BASE"),
  /** The address Recall can reach this server on, like https://wingman.up.railway.app */
  publicBaseUrl: env("PUBLIC_BASE_URL")?.replace(/\/+$/, ""),
  /** Shared secret for the Recall dashboard webhook (bot status events). */
  recallWebhookToken: env("RECALL_WEBHOOK_TOKEN"),
  botName: env("WINGMAN_BOT_NAME") ?? "ABU Notetaker",
  botChatMessage:
    env("WINGMAN_BOT_CHAT_MESSAGE") ??
    "Hi everyone, ABU Notetaker is transcribing this call so we can send an accurate recap afterward.",
  /** End a live call after this many minutes with no transcript. */
  idleMinutes: Number(env("WINGMAN_IDLE_MINUTES") ?? 15),
};

/** The placeholder a dashboard may copy in from .env.example. */
const PLACEHOLDER_KEY = "sk-ant-...";

export function hasCredentials(): boolean {
  const key = env("ANTHROPIC_API_KEY");
  return Boolean((key && key !== PLACEHOLDER_KEY) || env("ANTHROPIC_AUTH_TOKEN"));
}
