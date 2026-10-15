import { emptyForm, type Analysis, type Call, type CallState, type Lookup, type PostCall, type Utterance } from "../types.js";
import { analyze, type AnalysisInput } from "./analyze.js";
import { writePostCall } from "./postcall.js";
import { research } from "./research.js";

/** What the call loop asks of Claude. Swappable for tests and --mock. */
export interface Brain {
  analyze(input: AnalysisInput): Promise<Analysis>;
  research(lookup: Lookup, call: Call): Promise<string>;
  postCall(call: Call, state: CallState, utterances: Utterance[]): Promise<PostCall>;
}

export const claudeBrain: Brain = { analyze, research, postCall: writePostCall };

/**
 * A stand-in that never calls the API. It exercises the loop, timing, storage
 * and page end to end, so plumbing can be checked without spending tokens.
 * Its nudges say nothing about quality.
 */
export function mockBrain(): Brain {
  let passes = 0;
  return {
    async analyze({ recent, newFromSeq }) {
      passes++;
      const fresh = recent.filter((u) => u.seq >= newFromSeq && !u.isRep);
      const missed = fresh.find((u) => /\bmiss(ed|ing)?\b/i.test(u.text));
      return {
        nudge: passes % 3 === 0 ? `Mock nudge ${passes}, ask an open question about their phones` : "",
        nudgeKind: "discovery",
        pains: missed ? [{ label: "Missed calls", quote: missed.text.slice(0, 80), solution: "Live Answering picks up every call" }] : [],
        form: emptyForm(),
        fit: [],
        lookups: [],
      };
    },
    async research(lookup) {
      return `Mock research for ${lookup.query}.\nNo web search was run.`;
    },
    async postCall(call, state, utterances) {
      return {
        summary: `Mock summary of ${utterances.length} lines with ${state.pains.length} pains. No API call was made.`,
        nextSteps: ["Mock next step"],
        recapEmail: {
          subject: `Mock recap for ${call.prospectCompany ?? call.origin}`,
          body: "Hi there,\n\nThis is a mock recap draft.\n\nThanks",
        },
      };
    },
  };
}
