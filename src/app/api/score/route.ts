import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { anthropic, SCORING_MODEL, hasCredentials } from "@/lib/anthropic";
import { getCall, getPersona, getProductContext, saveCall } from "@/lib/db";
import { buildScoringPrompt } from "@/lib/prompts";
import type { Scorecard } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const score = z.number().min(0).max(100);

const ScorecardSchema = z.object({
  overall: score,
  breakdown: z.object({
    opener: score,
    objectionHandling: score,
    discovery: score,
    talkListenBalance: score,
    closing: score,
  }),
  meetingBooked: z.boolean(),
  repTalkRatio: z.number().min(0).max(1),
  fillerWords: z.array(z.object({ word: z.string(), count: z.number() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  coaching: z.array(
    z.object({
      moment: z.string(),
      whatHappened: z.string(),
      tryInstead: z.string(),
    }),
  ),
  summary: z.string(),
});

export async function POST(req: NextRequest) {
  if (!hasCredentials()) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
  }

  let callId: string;
  try {
    ({ callId } = (await req.json()) as { callId: string });
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const call = getCall(callId);
  if (!call) return Response.json({ error: "Call not found." }, { status: 404 });

  // Scoring costs a request, so never redo one we already have.
  if (call.scorecard) return Response.json({ scorecard: call.scorecard });

  const persona = getPersona(call.personaId);
  if (!persona) return Response.json({ error: "Persona not found." }, { status: 404 });

  const repTurns = call.transcript.filter((t) => t.speaker === "rep");
  if (repTurns.length === 0) {
    return Response.json(
      { error: "This call has no rep speech to score." },
      { status: 400 },
    );
  }

  const transcript = call.transcript
    .map((t) => `${t.speaker === "rep" ? "REP" : persona.name.toUpperCase()}: ${t.text}`)
    .join("\n");

  try {
    const response = await anthropic().messages.parse({
      model: SCORING_MODEL,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: buildScoringPrompt(
            persona,
            call.callType,
            getProductContext(),
            transcript,
            call.durationSec,
          ),
        },
      ],
      output_config: { format: zodOutputFormat(ScorecardSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return Response.json(
        { error: "The coach returned a response that could not be parsed." },
        { status: 502 },
      );
    }

    const scorecard = parsed as Scorecard;
    saveCall({ ...call, scorecard });

    return Response.json({ scorecard });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Anthropic rejected the API key." }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Rate limited. Wait a moment and score this call again." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return Response.json(
        { error: "Could not reach the Anthropic API." },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Anthropic API error (${err.status ?? "no status"}): ${err.message}` },
        { status: 502 },
      );
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 },
    );
  }
}
