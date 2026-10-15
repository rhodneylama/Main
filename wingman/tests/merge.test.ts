import { describe, expect, it } from "vitest";
import { mergeAnalysis } from "../src/loop/merge.js";
import { emptyForm, emptyState, type Analysis } from "../src/types.js";

function analysis(over: Partial<Analysis> = {}): Analysis {
  return { nudge: "", nudgeKind: "discovery", pains: [], form: emptyForm(), fit: [], lookups: [], ...over };
}
const at = { atMs: 1000, afterSeq: 3 };

describe("mergeAnalysis", () => {
  it("never lets a null erase a known form answer", () => {
    const state = emptyState();
    mergeAnalysis(state, analysis({ form: { ...emptyForm(), trucks: "six" } }), at);
    mergeAnalysis(state, analysis({ form: { ...emptyForm(), averageTicket: "$450" } }), at);
    expect(state.form.trucks).toBe("six");
    expect(state.form.averageTicket).toBe("$450");
  });

  it("dedupes pains by label and keeps the newer quote", () => {
    const state = emptyState();
    mergeAnalysis(state, analysis({ pains: [{ label: "Missed calls", quote: "a few", solution: "x" }] }), at);
    mergeAnalysis(state, analysis({ pains: [{ label: "missed calls", quote: "twenty a week", solution: "y" }] }), at);
    expect(state.pains).toHaveLength(1);
    expect(state.pains[0].quote).toBe("twenty a week");
  });

  it("keeps the earlier fit when a pass returns none", () => {
    const state = emptyState();
    mergeAnalysis(state, analysis({ fit: [{ service: "AI Hybrid", reason: "LSA calls" }] }), at);
    mergeAnalysis(state, analysis(), at);
    expect(state.fit.map((f) => f.service)).toEqual(["AI Hybrid"]);
  });

  it("stays silent on an empty or repeated nudge", () => {
    const state = emptyState();
    expect(mergeAnalysis(state, analysis(), at).nudge).toBeNull();
    expect(mergeAnalysis(state, analysis({ nudge: "Ask about weekends" }), at).nudge?.text).toBe("Ask about weekends");
    expect(mergeAnalysis(state, analysis({ nudge: "Ask about weekends." }), at).nudge).toBeNull();
  });

  it("flags long nudges", () => {
    const state = emptyState();
    const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(" ");
    expect(mergeAnalysis(state, analysis({ nudge: long }), at).nudge?.copyWarnings[0]).toMatch(/25 words/);
  });

  it("skips lookups already done and caps them per pass", () => {
    const state = emptyState();
    const lookup = (query: string) => ({ query, kind: "town" as const, why: "" });
    const first = mergeAnalysis(state, analysis({ lookups: [lookup("Plano TX"), lookup("Frisco"), lookup("McKinney")] }), at);
    expect(first.lookups.map((l) => l.query)).toEqual(["Plano TX", "Frisco"]);
    const second = mergeAnalysis(state, analysis({ lookups: [lookup("plano tx")] }), at);
    expect(second.lookups).toEqual([]);
  });
});
