import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, PROSPECT_MODEL, hasCredentials } from "@/lib/anthropic";
import { getPersona, getProductContext } from "@/lib/db";
import {
  CONTROL_MARKERS,
  buildProspectSystemPrompt,
  extractControlSignals,
  pendingMarkerLength,
} from "@/lib/prompts";
import type { CallType, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  personaId: string;
  callType: CallType;
  transcript: Turn[];
}

export async function POST(req: NextRequest) {
  if (!hasCredentials()) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key.",
      },
      { status: 500 },
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const persona = getPersona(body.personaId);
  if (!persona) {
    return Response.json({ error: `Unknown persona: ${body.personaId}` }, { status: 404 });
  }

  const system = buildProspectSystemPrompt(persona, body.callType, getProductContext());

  const messages: Anthropic.MessageParam[] = body.transcript.map((turn) => ({
    role: turn.speaker === "rep" ? ("user" as const) : ("assistant" as const),
    content: turn.text,
  }));

  // The model must always be responding to something the rep just said.
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json(
      { error: "The transcript must end with a turn from the rep." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        let emitted = 0;
        let accumulated = "";

        for await (const delta of prospectDeltas({ system, messages })) {
          accumulated += delta;

          // Withhold any trailing text that might turn out to be a marker.
          const safeEnd = accumulated.length - pendingMarkerLength(accumulated);
          if (safeEnd > emitted) {
            const chunk = accumulated.slice(emitted, safeEnd);
            emitted = safeEnd;
            const cleaned = chunk
              .replaceAll(CONTROL_MARKERS.hangup, "")
              .replaceAll(CONTROL_MARKERS.meetingBooked, "");
            if (cleaned) send({ t: "delta", text: cleaned });
          }
        }

        const { text, signals } = extractControlSignals(accumulated);
        send({ t: "done", text, signals });
      } catch (err) {
        send({ t: "error", message: describeError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

interface TurnParams {
  system: string;
  messages: Anthropic.MessageParam[];
}

/**
 * Yields text deltas for one prospect turn.
 *
 * Server-side refusal fallbacks are enabled by default. If this account isn't
 * enrolled in that beta the request fails before any text arrives, so we retry
 * once on the stable endpoint rather than breaking the call.
 */
async function* prospectDeltas({ system, messages }: TurnParams): AsyncGenerator<string> {
  const client = anthropic();

  const params = {
    model: PROSPECT_MODEL,
    max_tokens: 1024,
    // Low effort keeps turn latency conversational. A prospect's reply is a
    // sentence or two — it doesn't need deep reasoning, and on a live call
    // every extra second of thinking is dead air the rep hears as silence.
    output_config: { effort: "low" as const },
    system: [
      {
        type: "text" as const,
        text: system,
        // The system prompt is resent on every turn of the call, so caching it
        // is the single biggest cost saving here.
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages,
  };

  const attempts = [
    () =>
      client.beta.messages.stream({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      }),
    () => client.messages.stream(params),
  ];

  for (let i = 0; i < attempts.length; i++) {
    const isLastAttempt = i === attempts.length - 1;
    let produced = false;

    try {
      for await (const event of attempts[i]()) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          produced = true;
          yield event.delta.text;
        }
      }
      return;
    } catch (err) {
      // Only retry when nothing reached the caller and the failure looks like
      // the beta being unavailable — otherwise the rep would hear the turn twice.
      if (isLastAttempt || produced || !isBetaUnsupported(err)) throw err;
    }
  }
}

function isBetaUnsupported(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status !== 400 && err.status !== 403 && err.status !== 404) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("beta") || msg.includes("fallback");
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a moment and try again.";
  }
  // Checked before APIError: connection failures are APIErrors with no status.
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check your network connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error (${err.status ?? "no status"}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error.";
}
