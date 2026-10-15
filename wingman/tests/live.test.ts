import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wingman-live-"));
process.env.WINGMAN_DB_PATH = path.join(dir, "test.db");
process.env.PUBLIC_BASE_URL = "https://wingman.example.com/";
process.env.WINGMAN_REP_NAMES = "";

const created: unknown[] = [];
const left: string[] = [];
vi.mock("../src/recall/client.js", async (orig) => ({
  ...(await orig<typeof import("../src/recall/client.js")>()),
  createBot: async (input: unknown) => {
    created.push(input);
    return { id: "bot-1" };
  },
  leaveCall: async (id: string) => {
    left.push(id);
  },
}));

const { LiveCalls } = await import("../src/live/manager.js");
const { mockBrain } = await import("../src/brain/index.js");
const { getCall, getUtterances } = await import("../src/db.js");

describe("LiveCalls", () => {
  const live = new LiveCalls(mockBrain());
  let callId = "";
  let token = "";

  beforeAll(async () => {
    const session = await live.start({ meetingUrl: "https://meet.google.com/abc", prospectCompany: "Acme Trees" });
    callId = session.call.id;
    const url = new URL((created[0] as { transcriptWebhookUrl: string }).transcriptWebhookUrl);
    token = url.searchParams.get("token") ?? "";
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("sends the bot with a per-call webhook on the public address", () => {
    const url = (created[0] as { transcriptWebhookUrl: string }).transcriptWebhookUrl;
    expect(url.startsWith(`https://wingman.example.com/api/recall/transcript/${callId}?token=`)).toBe(true);
    expect(token.length).toBeGreaterThan(20);
    expect(getCall(callId)?.recall_bot_id).toBe("bot-1");
  });

  it("rejects lines without the right token", () => {
    expect(live.addLine(callId, "wrong", { speaker: "X", isHost: false, text: "hi" })).toBe(false);
  });

  it("uses the meeting host as the rep when no name is set", () => {
    live.addLine(callId, token, { speaker: "Rhodney Lamar", isHost: true, text: "How do calls get answered today?" });
    live.addLine(callId, token, { speaker: "Matt", isHost: false, text: "Emily takes them, and I miss the rest." });
    const lines = getUtterances(callId);
    expect(lines.map((u) => u.isRep)).toEqual([true, false]);
  });

  it("ends once, leaves the meeting, and saves the recap", async () => {
    await Promise.all([live.end(callId, "Test end."), live.end(callId, "Again.")]);
    expect(left).toEqual(["bot-1"]);
    const row = getCall(callId);
    expect(row?.status).toBe("ended");
    expect(row?.summary).toMatch(/Mock summary of 2 lines/);
    expect(row?.recap_email_draft).toMatch(/Mock recap for Acme Trees/);
  });
});
