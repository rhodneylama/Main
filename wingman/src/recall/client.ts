/**
 * The Recall.ai calls Wingman makes, and the transcript payload it reads.
 * Everything Recall-specific lives in this file, so if Recall renames a field
 * on your account version, this is the only place to change.
 *
 * API reference at https://docs.recall.ai
 */
import { config } from "../config.js";

function baseUrl(): string {
  return config.recallApiBase ?? `https://${config.recallRegion}.recall.ai/api/v1`;
}

async function recall<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!config.recallApiKey) throw new Error("RECALL_API_KEY is not set.");
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Token ${config.recallApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Recall ${method} ${path} failed with ${res.status}. ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface CreateBotInput {
  meetingUrl: string;
  /** Where Recall posts finalized transcript lines for this call. */
  transcriptWebhookUrl: string;
  callId: string;
}

export function createBotBody({ meetingUrl, transcriptWebhookUrl, callId }: CreateBotInput) {
  return {
    meeting_url: meetingUrl,
    bot_name: config.botName,
    recording_config: {
      transcript: {
        provider: { recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" } },
      },
      realtime_endpoints: [{ type: "webhook", url: transcriptWebhookUrl, events: ["transcript.data"] }],
    },
    chat: { on_bot_join: { send_to: "everyone", message: config.botChatMessage } },
    metadata: { wingman_call_id: callId },
  };
}

export async function createBot(input: CreateBotInput): Promise<{ id: string }> {
  return recall<{ id: string }>("POST", "/bot/", createBotBody(input));
}

export async function leaveCall(botId: string): Promise<void> {
  await recall("POST", `/bot/${encodeURIComponent(botId)}/leave_call/`);
}

export interface TranscriptLine {
  speaker: string;
  isHost: boolean | null;
  text: string;
}

/**
 * Reads one transcript.data delivery. Returns null for anything that is not a
 * finished line with words in it.
 */
export function parseTranscriptEvent(body: any): TranscriptLine | null {
  if (!body || (body.event && body.event !== "transcript.data")) return null;
  // Current shape is { event, data: { data: { words, participant } } }. Older
  // accounts send the inner object one level up, so accept both.
  const inner = body.data?.data ?? body.data ?? body;
  const words: { text?: string }[] = Array.isArray(inner?.words) ? inner.words : [];
  const text = words
    .map((w) => w.text ?? "")
    .join(" ")
    .replace(/\s+([,.?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const participant = inner.participant ?? {};
  return {
    speaker: participant.name || (participant.id != null ? `Participant ${participant.id}` : "Unknown"),
    isHost: typeof participant.is_host === "boolean" ? participant.is_host : null,
    text,
  };
}

/** Bot status events from the Recall dashboard webhook that mean the call is over. */
const ENDED_EVENTS = new Set(["bot.call_ended", "bot.done", "bot.fatal"]);
const ENDED_CODES = new Set(["call_ended", "done", "fatal"]);

export function parseBotStatusEvent(body: any): { botId: string; ended: boolean; code: string } | null {
  const event: string | undefined = body?.event;
  const botId: string | undefined = body?.data?.bot?.id ?? body?.data?.bot_id;
  if (!event || !botId) return null;
  // Older accounts send one bot.status_change event with a status code.
  const code: string = event === "bot.status_change" ? (body.data?.status?.code ?? "") : event.replace(/^bot\./, "");
  return { botId, code, ended: ENDED_EVENTS.has(event) || ENDED_CODES.has(code) };
}

/** Zoom and Meet links only, so the bot is not sent somewhere unexpected. */
export function isMeetingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return /(^|\.)zoom\.us$/.test(u.hostname) || u.hostname === "meet.google.com";
  } catch {
    return false;
  }
}
