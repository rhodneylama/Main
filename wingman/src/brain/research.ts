import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { Call, Lookup } from "../types.js";
import { anthropic, FALLBACK_BETA, withFallbackRetry } from "./client.js";
import { RESEARCH_SYSTEM_PROMPT } from "./prompt.js";

const WEB_SEARCH = { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3 };

/** Looks up one named thing with web search and returns a two-line summary. */
export async function research(lookup: Lookup, call: Call): Promise<string> {
  const client = anthropic();
  const where = call.prospectCompany ? ` The prospect is ${call.prospectCompany}.` : "";
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Look up this ${lookup.kind}: ${lookup.query}. Why it matters on the call: ${lookup.why}.${where}`,
    },
  ];

  // A long search can pause mid-turn. Resume it a couple of times at most,
  // since a research note that lands after the moment has passed is no use.
  for (let attempt = 0; attempt < 3; attempt++) {
    const params = {
      model: config.model,
      max_tokens: 2000,
      output_config: { effort: "low" as const },
      system: RESEARCH_SYSTEM_PROMPT,
      tools: [WEB_SEARCH],
      messages,
    };
    const message = await withFallbackRetry(
      () => client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" }),
      () => client.beta.messages.create(params),
    );

    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.stop_reason === "refusal") throw new Error("Claude declined this lookup.");

    // The answer is the text written after the last search result.
    const lastResult = message.content.map((b) => b.type).lastIndexOf("web_search_tool_result");
    const text = message.content
      .slice(lastResult + 1)
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new Error("Research returned no summary.");
    return text;
  }
  throw new Error("Research did not finish in time.");
}
