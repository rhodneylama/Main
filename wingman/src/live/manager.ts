import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Brain } from "../brain/index.js";
import { config } from "../config.js";
import { finishCall, insertCall, recordSession, setRecallBotId } from "../db.js";
import { CallSession } from "../loop/session.js";
import { createBot, leaveCall, type TranscriptLine } from "../recall/client.js";
import type { Call } from "../types.js";

/** How often a live call checks for unanalyzed lines after a quiet stretch. */
const TICK_MS = 2000;

interface LiveCall {
  session: CallSession;
  /** Secret in the transcript webhook URL, so only Recall can post lines. */
  token: string;
  lastLineAt: number;
  timer: NodeJS.Timeout;
  ending: Promise<void> | null;
}

export interface StartLiveInput {
  meetingUrl: string;
  prospectCompany?: string | null;
  prospectWebsite?: string | null;
}

/**
 * Runs live calls. Recall's bot joins the meeting and posts each finished
 * line to /api/recall/transcript/:callId. Each line goes into the same
 * CallSession that replays use. The call ends from the page's End call
 * button, a Recall status webhook, or after a long silence.
 */
export class LiveCalls {
  private calls = new Map<string, LiveCall>();

  constructor(
    private readonly brain: Brain,
    private readonly onSession: (session: CallSession) => void = () => {},
  ) {}

  get(callId: string): CallSession | undefined {
    return this.calls.get(callId)?.session;
  }

  async start(input: StartLiveInput): Promise<CallSession> {
    if (!config.publicBaseUrl) throw new Error("PUBLIC_BASE_URL is not set, so Recall has nowhere to send the transcript.");

    const call: Call = {
      id: randomUUID(),
      source: "live",
      status: "running",
      origin: input.meetingUrl,
      prospectCompany: input.prospectCompany || null,
      prospectWebsite: input.prospectWebsite || null,
      repNames: config.repNames,
      startedAt: Date.now(),
      endedAt: null,
      recallBotId: null,
      summary: null,
      recapEmailDraft: null,
    };
    const session = new CallSession(call, this.brain, { intervalMs: config.intervalMs, research: config.research });
    insertCall(call);
    recordSession(session);

    const token = randomBytes(24).toString("hex");
    const webhookUrl = `${config.publicBaseUrl}/api/recall/transcript/${call.id}?token=${token}`;
    let botId: string;
    try {
      ({ id: botId } = await createBot({ meetingUrl: input.meetingUrl, transcriptWebhookUrl: webhookUrl, callId: call.id }));
    } catch (err) {
      finishCall(call.id, "failed", session.state);
      throw err;
    }
    call.recallBotId = botId;
    setRecallBotId(call.id, botId);

    const live: LiveCall = {
      session,
      token,
      lastLineAt: Date.now(),
      ending: null,
      timer: setInterval(() => this.tick(call.id), TICK_MS),
    };
    this.calls.set(call.id, live);
    this.onSession(session);

    session.emitEvent({ type: "call", call });
    session.emitEvent({ type: "status", status: "running", message: `${config.botName} is joining the meeting.` });
    return session;
  }

  /** False when the call is unknown or the token does not match. */
  addLine(callId: string, token: string, line: TranscriptLine): boolean {
    const live = this.calls.get(callId);
    if (!live || !safeEqual(token, live.token)) return false;
    if (live.ending) return true;
    live.lastLineAt = Date.now();
    const { session } = live;
    // A configured name wins. With none set, the meeting host is taken to be the rep.
    const isRep = session.call.repNames.length ? undefined : (line.isHost ?? undefined);
    session.addUtterance(line.speaker, line.text, Date.now() - session.call.startedAt, isRep);
    return true;
  }

  findByBotId(botId: string): string | undefined {
    for (const [id, live] of this.calls) if (live.session.call.recallBotId === botId) return id;
    return undefined;
  }

  /** Ends the call once, however many things ask it to. */
  end(callId: string, reason: string): Promise<void> {
    const live = this.calls.get(callId);
    if (!live) return Promise.resolve();
    if (!live.ending) live.ending = this.finish(callId, live, reason);
    return live.ending;
  }

  private async finish(callId: string, live: LiveCall, reason: string): Promise<void> {
    clearInterval(live.timer);
    const { session } = live;
    session.emitEvent({ type: "status", status: "running", message: `${reason} Writing the recap.` });

    if (session.call.recallBotId) {
      // The bot may already be gone, which is fine.
      await leaveCall(session.call.recallBotId).catch(() => {});
    }
    await session.wrapUp(Date.now() - session.call.startedAt, { postCall: true });
    session.call.status = "ended";
    session.call.endedAt = Date.now();
    finishCall(callId, "ended", session.state);
    session.emitEvent({ type: "status", status: "ended" });
    // Keep it around briefly so a page that reconnects still finds it live.
    setTimeout(() => this.calls.delete(callId), 60_000);
  }

  private tick(callId: string): void {
    const live = this.calls.get(callId);
    if (!live || live.ending) return;
    live.session.tick(Date.now() - live.session.call.startedAt);
    if (Date.now() - live.lastLineAt > config.idleMinutes * 60_000) {
      void this.end(callId, `No one has spoken for ${config.idleMinutes} minutes.`);
    }
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
