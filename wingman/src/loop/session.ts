import { EventEmitter } from "node:events";
import { cleanCopy } from "../brain/copy.js";
import { describeError } from "../brain/client.js";
import type { Brain } from "../brain/index.js";
import { TRANSCRIPT_WINDOW } from "../brain/analyze.js";
import { emptyState, type Call, type CallState, type Lookup, type Utterance, type WingmanEvent } from "../types.js";
import { mergeAnalysis } from "./merge.js";

/** Fewest new prospect words that make a finished turn worth a pass. */
const MIN_PROSPECT_WORDS = 6;

export interface SessionOptions {
  intervalMs: number;
  research: boolean;
}

/**
 * One call's live loop. Utterances come in from Recall (live) or a transcript
 * file (replay) through the same addUtterance call. A pass runs when the
 * prospect finishes a turn, or when someone has been talking for a full
 * interval. Only one pass runs at a time; lines that arrive during a pass wait
 * for the next one.
 */
export class CallSession extends EventEmitter {
  readonly state: CallState = emptyState();
  readonly utterances: Utterance[] = [];
  passCount = 0;

  private lastAnalyzedSeq = -1;
  private lastPassAtMs = 0;
  private inFlight: Promise<void> | null = null;
  private wantsPass = false;
  private pendingResearch = new Set<Promise<void>>();

  constructor(
    readonly call: Call,
    private readonly brain: Brain,
    private readonly opts: SessionOptions,
  ) {
    super();
  }

  isRepSpeaker(speaker: string): boolean {
    const s = speaker.toLowerCase();
    return this.call.repNames.some((name) => s.includes(name.toLowerCase()));
  }

  addUtterance(speaker: string, text: string, atMs: number): Utterance {
    const prev = this.utterances[this.utterances.length - 1];
    // Recordings often start partway in, so the interval runs from the first line.
    if (!prev) this.lastPassAtMs = atMs;
    const utterance: Utterance = {
      seq: this.utterances.length,
      speaker,
      isRep: this.isRepSpeaker(speaker),
      text: text.trim(),
      atMs,
    };
    this.utterances.push(utterance);
    this.emitEvent({ type: "utterance", utterance });

    // The prospect just finished a turn and the rep is about to answer. This
    // is the moment a nudge is most useful, so analyze the prospect's turn now.
    // A bare "okay" or "yeah" is not a turn worth a pass.
    const prospectFinished =
      prev && !prev.isRep && utterance.isRep && this.unanalyzedProspectWords() >= MIN_PROSPECT_WORDS;
    if (prospectFinished) {
      this.requestPass(atMs, prev.seq);
    } else if (atMs - this.lastPassAtMs >= this.opts.intervalMs) {
      this.requestPass(atMs, utterance.seq);
    }
    return utterance;
  }

  private unanalyzedProspectWords(): number {
    let words = 0;
    for (let i = this.lastAnalyzedSeq + 1; i < this.utterances.length; i++) {
      const u = this.utterances[i];
      if (!u.isRep) words += u.text.split(/\s+/).filter(Boolean).length;
    }
    return words;
  }

  /**
   * For live calls with a quiet stretch after the last line. Runs a pass if
   * unanalyzed lines have sat for a full interval.
   */
  tick(nowMs: number): void {
    const last = this.utterances[this.utterances.length - 1];
    if (last && last.seq > this.lastAnalyzedSeq && nowMs - this.lastPassAtMs >= this.opts.intervalMs) {
      this.requestPass(nowMs, last.seq);
    }
  }

  /** Waits for the current pass, any queued pass, and outstanding research. */
  async settle(): Promise<void> {
    while (this.inFlight || this.pendingResearch.size) {
      if (this.inFlight) await this.inFlight;
      if (this.pendingResearch.size) await Promise.all([...this.pendingResearch]);
    }
  }

  /** Analyze whatever is left. Used at the end of a replay or call. */
  async flush(atMs: number): Promise<void> {
    await this.settle();
    const last = this.utterances[this.utterances.length - 1];
    if (last && last.seq > this.lastAnalyzedSeq) this.requestPass(atMs, last.seq);
    await this.settle();
  }

  private requestPass(atMs: number, uptoSeq: number): void {
    if (this.inFlight) {
      this.wantsPass = true;
      return;
    }
    this.inFlight = this.runPass(atMs, uptoSeq).finally(() => {
      this.inFlight = null;
      const last = this.utterances[this.utterances.length - 1];
      if (this.wantsPass && last && last.seq > this.lastAnalyzedSeq) {
        this.wantsPass = false;
        this.requestPass(last.atMs, last.seq);
      }
      this.wantsPass = false;
    });
  }

  private async runPass(atMs: number, uptoSeq: number): Promise<void> {
    const newFromSeq = this.lastAnalyzedSeq + 1;
    const upto = this.utterances.slice(0, uptoSeq + 1);
    const recent = upto.slice(-TRANSCRIPT_WINDOW);
    this.lastAnalyzedSeq = uptoSeq;
    this.lastPassAtMs = atMs;
    this.passCount++;

    try {
      const analysis = await this.brain.analyze({ call: this.call, state: this.state, recent, newFromSeq });
      const { nudge, lookups } = mergeAnalysis(this.state, analysis, { atMs, afterSeq: uptoSeq });
      if (nudge) this.emitEvent({ type: "nudge", nudge });
      this.emitState();
      if (this.opts.research) for (const lookup of lookups) this.startResearch(lookup, atMs);
    } catch (err) {
      this.emitEvent({ type: "error", message: `Analysis pass failed. ${describeError(err)}` });
    }
  }

  private startResearch(lookup: Lookup, atMs: number): void {
    const job = this.brain
      .research(lookup, this.call)
      .then((raw) => {
        const note = { query: lookup.query, kind: lookup.kind, summary: cleanCopy(raw).text, atMs };
        this.state.research.push(note);
        this.emitEvent({ type: "research", note });
      })
      .catch((err) => {
        this.emitEvent({ type: "error", message: `Research on ${lookup.query} failed. ${describeError(err)}` });
      })
      .finally(() => this.pendingResearch.delete(job));
    this.pendingResearch.add(job);
  }

  private emitState(): void {
    const { pains, form, fit, research } = this.state;
    this.emitEvent({ type: "state", state: { pains, form, fit, research } });
  }

  emitEvent(event: WingmanEvent): void {
    this.emit("event", event);
  }
}
