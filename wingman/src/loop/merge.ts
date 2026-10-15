import { cleanCopy, wordCount } from "../brain/copy.js";
import type { Analysis, CallState, DiscoveryForm, Lookup, Nudge, Pain } from "../types.js";

export const MAX_NUDGE_WORDS = 20;
export const MAX_LOOKUPS_PER_PASS = 2;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fold one analysis pass into the running state. Returns the nudge to show
 * (or null for silence) and the lookups that still need research.
 */
export function mergeAnalysis(
  state: CallState,
  analysis: Analysis,
  at: { atMs: number; afterSeq: number },
): { nudge: Nudge | null; lookups: Lookup[] } {
  state.form = mergeForm(state.form, analysis.form);
  state.pains = mergePains(state.pains, analysis.pains);
  // An empty ranking means "not enough yet", so it never erases an earlier one.
  if (analysis.fit.length) {
    state.fit = analysis.fit.map((f) => ({ ...f, reason: cleanCopy(f.reason).text })).slice(0, 3);
  }

  const lookups: Lookup[] = [];
  for (const lookup of analysis.lookups) {
    const key = norm(lookup.query);
    if (!key || state.lookedUp.some((q) => norm(q) === key)) continue;
    if (lookups.length >= MAX_LOOKUPS_PER_PASS) break;
    state.lookedUp.push(lookup.query);
    lookups.push(lookup);
  }

  return { nudge: toNudge(state, analysis, at), lookups };
}

function toNudge(state: CallState, analysis: Analysis, at: { atMs: number; afterSeq: number }): Nudge | null {
  const { text, warnings } = cleanCopy(analysis.nudge);
  if (!text) return null;

  // Claude is told not to repeat itself. This catches the times it does anyway.
  const key = norm(text);
  if (state.nudges.slice(-8).some((n) => norm(n.text) === key)) return null;

  const words = wordCount(text);
  if (words > MAX_NUDGE_WORDS) warnings.push(`${words} words, over the ${MAX_NUDGE_WORDS} word limit`);

  const nudge: Nudge = { text, kind: analysis.nudgeKind, atMs: at.atMs, afterSeq: at.afterSeq, copyWarnings: warnings };
  state.nudges.push(nudge);
  return nudge;
}

export function mergeForm(current: DiscoveryForm, incoming: DiscoveryForm): DiscoveryForm {
  const next = { ...current };
  for (const key of Object.keys(next) as (keyof DiscoveryForm)[]) {
    const value = incoming[key]?.trim();
    // A null never erases a known answer. A new value is a correction.
    if (value) next[key] = value;
  }
  return next;
}

export function mergePains(current: Pain[], incoming: Pain[]): Pain[] {
  const next = [...current];
  for (const pain of incoming) {
    const cleaned: Pain = { label: pain.label.trim(), quote: pain.quote.trim(), solution: cleanCopy(pain.solution).text };
    if (!cleaned.label) continue;
    const i = next.findIndex((p) => norm(p.label) === norm(cleaned.label));
    if (i >= 0) next[i] = cleaned;
    else next.push(cleaned);
  }
  return next;
}
