import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Brain } from "../brain/index.js";
import { finishCall, insertCall, recordSession } from "../db.js";
import { CallSession } from "../loop/session.js";
import type { Call } from "../types.js";
import { guessRep, parseTranscript, speakers } from "./parse.js";

export interface ReplayOptions {
  filePath: string;
  brain: Brain;
  intervalMs: number;
  research: boolean;
  /** 0 replays as fast as Claude answers. 1 is real time, 4 is four times faster. */
  speed: number;
  repNames: string[];
  prospectCompany?: string | null;
  prospectWebsite?: string | null;
  /** Store the replay in SQLite. Off in tests. */
  persist?: boolean;
  /** Write the summary and recap draft at the end. */
  postCall?: boolean;
}

export interface Replay {
  session: CallSession;
  repNotice: string | null;
  done: Promise<void>;
}

/**
 * Feeds a saved transcript through the same CallSession a live call uses.
 * In fast mode each pass finishes before the next line arrives, so research
 * lands where it would on a live call rather than all at the end.
 */
export function startReplay(opts: ReplayOptions): Replay {
  const content = fs.readFileSync(opts.filePath, "utf8");
  const fileName = path.basename(opts.filePath);
  const lines = parseTranscript(content, fileName);
  if (!lines.length) throw new Error(`No transcript lines found in ${fileName}.`);

  const names = speakers(lines);
  let repNames = opts.repNames.filter((n) => names.some((s) => s.toLowerCase().includes(n.toLowerCase())));
  let repNotice: string | null = null;
  if (!repNames.length) {
    const guess = guessRep(lines) ?? names[0];
    repNames = [guess];
    repNotice = `No rep name matched the speakers (${names.join(", ")}). Treating ${guess} as the rep. Pass --rep to change it.`;
  }

  const call: Call = {
    id: randomUUID(),
    source: "replay",
    status: "running",
    origin: fileName,
    prospectCompany: opts.prospectCompany ?? null,
    prospectWebsite: opts.prospectWebsite ?? null,
    repNames,
    startedAt: Date.now(),
    endedAt: null,
    recallBotId: null,
    summary: null,
    recapEmailDraft: null,
  };

  const session = new CallSession(call, opts.brain, { intervalMs: opts.intervalMs, research: opts.research });
  if (opts.persist !== false) {
    insertCall(call);
    recordSession(session);
  }

  const done = (async () => {
    // Let callers attach listeners before the first line goes out.
    await new Promise((r) => setImmediate(r));
    session.emitEvent({ type: "call", call });
    session.emitEvent({ type: "status", status: "running", message: repNotice ?? undefined });
    try {
      let prevAt = 0;
      for (const line of lines) {
        if (opts.speed > 0) await sleep((line.atMs - prevAt) / opts.speed);
        prevAt = line.atMs;
        session.addUtterance(line.speaker, line.text, line.atMs);
        if (opts.speed === 0) await session.settle();
      }
      const end = lines[lines.length - 1];
      await session.wrapUp(end.atMs + 2000, { postCall: opts.postCall !== false });
      call.status = "ended";
      session.emitEvent({ type: "status", status: "ended" });
    } catch (err) {
      call.status = "failed";
      session.emitEvent({ type: "status", status: "failed", message: err instanceof Error ? err.message : String(err) });
    } finally {
      call.endedAt = Date.now();
      if (opts.persist !== false) finishCall(call.id, call.status, session.state);
    }
  })();

  return { session, repNotice, done };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
