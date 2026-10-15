import * as z from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "../config.js";
import { DISCOVERY_FIELDS, type Call, type CallState, type PostCall, type Utterance } from "../types.js";
import { formatClock } from "./analyze.js";
import { anthropic, FALLBACK_BETA, withFallbackRetry } from "./client.js";
import { POSTCALL_SYSTEM_PROMPT } from "./prompt.js";

const PostCallSchema = z.object({
  summary: z.string(),
  next_steps: z.array(z.string()),
  recap_email_subject: z.string(),
  recap_email_body: z.string(),
});

/** Writes the summary and a recap email draft from the whole call. */
export async function writePostCall(call: Call, state: CallState, utterances: Utterance[]): Promise<PostCall> {
  const client = anthropic();
  const params = {
    model: config.model,
    max_tokens: 8000,
    output_config: { effort: "medium" as const, format: betaZodOutputFormat(PostCallSchema) },
    system: POSTCALL_SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: buildPostCallMessage(call, state, utterances) }],
  };
  const message = await withFallbackRetry(
    () => client.beta.messages.parse({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" }),
    () => client.beta.messages.parse(params),
  );
  if (message.stop_reason === "refusal") throw new Error("Claude declined to write the recap.");
  const out = message.parsed_output;
  if (!out) throw new Error(`Recap could not be parsed (stop reason ${message.stop_reason}).`);
  return {
    summary: out.summary,
    nextSteps: out.next_steps,
    recapEmail: { subject: out.recap_email_subject, body: out.recap_email_body },
  };
}

export function buildPostCallMessage(call: Call, state: CallState, utterances: Utterance[]): string {
  const parts: string[] = [];
  parts.push(
    `## Call\nABU rep: ${call.repNames.join(", ")}${call.prospectCompany ? `\nProspect company: ${call.prospectCompany}` : ""}`,
  );
  parts.push(
    `## Discovery form\n${DISCOVERY_FIELDS.map(({ key, label }) => `- ${label}: ${state.form[key] ?? "not stated"}`).join("\n")}`,
  );
  parts.push(
    `## Pains heard\n${state.pains.length ? state.pains.map((p) => `- ${p.label}: "${p.quote}"`).join("\n") : "none recorded"}`,
  );
  parts.push(
    `## Service fit from the call\n${state.fit.length ? state.fit.map((f, i) => `${i + 1}. ${f.service}, ${f.reason}`).join("\n") : "not settled"}`,
  );
  if (state.research.length) {
    parts.push(`## Research\n${state.research.map((r) => `- ${r.query}: ${r.summary.replace(/\n/g, " ")}`).join("\n")}`);
  }
  const transcript = utterances
    .map((u) => `[${formatClock(u.atMs)}] ${u.isRep ? "REP" : "PROSPECT"} (${u.speaker}): ${u.text}`)
    .join("\n");
  parts.push(`## Full transcript\n${transcript}`);
  return parts.join("\n\n");
}
