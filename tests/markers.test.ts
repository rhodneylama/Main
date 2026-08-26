/**
 * Run with: npm test
 *
 * Covers the control-marker handling on the prospect stream. This is the part
 * most likely to break silently: a marker that arrives split across two SSE
 * chunks must never reach the transcript or the speech synthesiser.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CONTROL_MARKERS,
  extractControlSignals,
  pendingMarkerLength,
} from "@/lib/prompts";

/** Mirrors the emit loop in src/app/api/chat/route.ts. */
function streamThrough(chunks: string[]): { emitted: string; final: string; signals: unknown } {
  let accumulated = "";
  let emitted = 0;
  let out = "";

  for (const chunk of chunks) {
    accumulated += chunk;
    const safeEnd = accumulated.length - pendingMarkerLength(accumulated);
    if (safeEnd > emitted) {
      const slice = accumulated.slice(emitted, safeEnd);
      emitted = safeEnd;
      out += slice
        .replaceAll(CONTROL_MARKERS.hangup, "")
        .replaceAll(CONTROL_MARKERS.meetingBooked, "");
    }
  }

  const { text, signals } = extractControlSignals(accumulated);
  return { emitted: out, final: text, signals };
}

/** Splits a string into chunks of n characters, worst case for markers. */
function chop(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

test("a marker split across every possible boundary never leaks", () => {
  const full = `Fine. Tuesday at ten. ${CONTROL_MARKERS.meetingBooked}`;

  for (let split = 1; split < full.length; split++) {
    const { emitted } = streamThrough([full.slice(0, split), full.slice(split)]);
    assert.ok(!emitted.includes("[["), `leaked at split ${split}: ${JSON.stringify(emitted)}`);
    assert.equal(emitted.trim(), "Fine. Tuesday at ten.");
  }
});

test("a marker delivered one character at a time never leaks", () => {
  const full = `Not interested. ${CONTROL_MARKERS.hangup}`;
  const { emitted, signals } = streamThrough(chop(full, 1));

  assert.ok(!emitted.includes("["), `leaked: ${JSON.stringify(emitted)}`);
  assert.equal(emitted.trim(), "Not interested.");
  assert.deepEqual(signals, { hangup: true, meetingBooked: false });
});

test("text containing brackets but no marker still streams through", () => {
  const full = "We looked at [vendor] last year. Two brackets [[ mean nothing to me.";
  const { emitted } = streamThrough(chop(full, 3));
  assert.equal(emitted, full);
});

test("signals are detected and stripped from the final text", () => {
  const booked = extractControlSignals(`Alright, send an invite. ${CONTROL_MARKERS.meetingBooked}`);
  assert.deepEqual(booked.signals, { hangup: false, meetingBooked: true });
  assert.equal(booked.text, "Alright, send an invite.");

  const hungUp = extractControlSignals(`Lose my number. ${CONTROL_MARKERS.hangup}`);
  assert.equal(hungUp.signals.hangup, true);
  assert.equal(hungUp.text, "Lose my number.");

  const plain = extractControlSignals("Go on then, you've got thirty seconds.");
  assert.deepEqual(plain.signals, { hangup: false, meetingBooked: false });
  assert.equal(plain.text, "Go on then, you've got thirty seconds.");
});

test("stage directions are stripped so they are never spoken aloud", () => {
  assert.equal(extractControlSignals("*sighs* What is this about?").text, "What is this about?");
  assert.equal(extractControlSignals("(pauses) Go on.").text, "Go on.");
});

test("pendingMarkerLength holds back only genuine marker prefixes", () => {
  assert.equal(pendingMarkerLength("no markers here"), 0);
  assert.equal(pendingMarkerLength("done ["), 1);
  assert.equal(pendingMarkerLength("done [["), 2);
  assert.equal(pendingMarkerLength("done [[HANG"), 6);
  // A complete marker counts as its own prefix, so a marker sitting at the end
  // of the stream is held back in full and never emitted at all.
  assert.equal(
    pendingMarkerLength(`done ${CONTROL_MARKERS.hangup}`),
    CONTROL_MARKERS.hangup.length,
  );
});

test("a marker followed by more speech is stripped rather than held back", () => {
  // Once further text arrives the marker is no longer a trailing prefix, so it
  // is released into the stream — the route's replaceAll is what removes it.
  const { emitted, final, signals } = streamThrough(
    chop(`Right. ${CONTROL_MARKERS.hangup} Goodbye.`, 2),
  );

  assert.ok(!emitted.includes("[["), `leaked: ${JSON.stringify(emitted)}`);
  assert.equal(emitted.replace(/\s+/g, " ").trim(), "Right. Goodbye.");
  assert.equal(final.replace(/\s+/g, " ").trim(), "Right. Goodbye.");
  assert.deepEqual(signals, { hangup: true, meetingBooked: false });
});
