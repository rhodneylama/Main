import * as z from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "../config.js";
import {
  ABU_SERVICES,
  DISCOVERY_FIELDS,
  LOOKUP_KINDS,
  NUDGE_KINDS,
  type Analysis,
  type Call,
  type CallState,
  type DiscoveryForm,
  type Utterance,
} from "../types.js";
import { anthropic, FALLBACK_BETA, withFallbackRetry } from "./client.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export interface AnalysisInput {
  call: Call;
  state: CallState;
  /** Recent transcript window, oldest first. */
  recent: Utterance[];
  /** Utterances with seq at or above this are new since the last pass. */
  newFromSeq: number;
}

const nullableText = z.string().nullable();

/** Snake case on the wire, since that is what the prompt describes. */
const AnalysisSchema = z.object({
  nudge: z.string(),
  nudge_kind: z.enum(NUDGE_KINDS),
  pains: z.array(z.object({ label: z.string(), quote: z.string(), solution: z.string() })),
  form: z.object({
    trade: nullableText,
    years_in_business: nullableText,
    trucks: nullableText,
    jobs_per_month: nullableText,
    average_ticket: nullableText,
    who_answers_phones: nullableText,
    office_staff: nullableText,
    needs_help_with: nullableText,
    lead_sources: nullableText,
    coverage_wanted: nullableText,
    call_mix: nullableText,
  }),
  fit: z.array(z.object({ service: z.enum(ABU_SERVICES), reason: z.string() })),
  lookups: z.array(z.object({ query: z.string(), kind: z.enum(LOOKUP_KINDS), why: z.string() })),
});
type WireAnalysis = z.infer<typeof AnalysisSchema>;

/** How many utterances of history each pass sees. The state carries the rest. */
export const TRANSCRIPT_WINDOW = 40;

export async function analyze(input: AnalysisInput): Promise<Analysis> {
  const client = anthropic();
  const params = {
    model: config.model,
    max_tokens: 4000,
    output_config: { effort: config.liveEffort, format: betaZodOutputFormat(AnalysisSchema) },
    system: [{ type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: buildUserMessage(input) }],
  };

  const message = await withFallbackRetry(
    () => client.beta.messages.parse({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" }),
    () => client.beta.messages.parse(params),
  );

  if (message.stop_reason === "refusal") throw new Error("Claude declined this pass.");
  if (!message.parsed_output) throw new Error(`Analysis could not be parsed (stop reason ${message.stop_reason}).`);
  return fromWire(message.parsed_output as WireAnalysis);
}

function fromWire(w: WireAnalysis): Analysis {
  const f = w.form;
  const form: DiscoveryForm = {
    trade: f.trade,
    yearsInBusiness: f.years_in_business,
    trucks: f.trucks,
    jobsPerMonth: f.jobs_per_month,
    averageTicket: f.average_ticket,
    whoAnswersPhones: f.who_answers_phones,
    officeStaff: f.office_staff,
    needsHelpWith: f.needs_help_with,
    leadSources: f.lead_sources,
    coverageWanted: f.coverage_wanted,
    callMix: f.call_mix,
  };
  return { nudge: w.nudge, nudgeKind: w.nudge_kind, pains: w.pains, form, fit: w.fit, lookups: w.lookups };
}

export function buildUserMessage({ call, state, recent, newFromSeq }: AnalysisInput): string {
  const parts: string[] = [];

  const context = [
    `ABU rep speaker label(s): ${call.repNames.length ? call.repNames.join(", ") : "unknown, infer from who is asking discovery questions"}`,
    call.prospectCompany ? `Prospect company: ${call.prospectCompany}` : null,
    call.prospectWebsite ? `Prospect website: ${call.prospectWebsite}` : null,
  ].filter(Boolean);
  parts.push(`## Call\n${context.join("\n")}`);

  const formLines = DISCOVERY_FIELDS.map(({ key, label }) => `- ${label}: ${state.form[key] ?? "unknown"}`);
  parts.push(`## Discovery form so far\n${formLines.join("\n")}`);

  parts.push(
    `## Pains already saved\n${
      state.pains.length ? state.pains.map((p) => `- ${p.label}: "${p.quote}"`).join("\n") : "none yet"
    }`,
  );

  parts.push(
    `## Current fit ranking\n${
      state.fit.length ? state.fit.map((f, i) => `${i + 1}. ${f.service}, ${f.reason}`).join("\n") : "none yet"
    }`,
  );

  const researched = [
    ...state.research.map((r) => `- ${r.query}: ${r.summary.replace(/\n/g, " ")}`),
    ...state.lookedUp
      .filter((q) => !state.research.some((r) => r.query === q))
      .map((q) => `- ${q}: lookup in progress`),
  ];
  parts.push(`## Already researched\n${researched.length ? researched.join("\n") : "nothing yet"}`);

  const sent = state.nudges.slice(-8);
  parts.push(
    `## Nudges already sent (most recent last)\n${sent.length ? sent.map((n) => `- ${n.text}`).join("\n") : "none yet"}`,
  );

  const lines = recent.map((u) => {
    const who = `${u.isRep ? "REP" : "PROSPECT"} (${u.speaker})`;
    const marker = u.seq >= newFromSeq ? ">> " : "   ";
    return `${marker}[${formatClock(u.atMs)}] ${who}: ${u.text}`;
  });
  parts.push(
    `## Transcript (recent window, lines marked >> are new since your last pass)\n${lines.join("\n")}`,
  );

  return parts.join("\n\n");
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
