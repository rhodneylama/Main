import { describe, expect, it } from "vitest";
import { createBotBody, isMeetingUrl, parseBotStatusEvent, parseTranscriptEvent } from "../src/recall/client.js";

describe("parseTranscriptEvent", () => {
  it("reads the current nested transcript.data shape", () => {
    const body = {
      event: "transcript.data",
      data: {
        data: {
          words: [
            { text: "We", start_timestamp: { relative: 1.2 } },
            { text: "miss" },
            { text: "calls" },
            { text: "." },
          ],
          participant: { id: 2, name: "Matt Jones", is_host: false },
        },
      },
    };
    expect(parseTranscriptEvent(body)).toEqual({ speaker: "Matt Jones", isHost: false, text: "We miss calls." });
  });

  it("accepts the older flat shape and unnamed participants", () => {
    expect(parseTranscriptEvent({ data: { words: [{ text: "Hi" }], participant: { id: 7 } } })).toEqual({
      speaker: "Participant 7",
      isHost: null,
      text: "Hi",
    });
  });

  it("ignores partials and empty lines", () => {
    expect(parseTranscriptEvent({ event: "transcript.partial_data", data: { data: { words: [{ text: "Hi" }] } } })).toBeNull();
    expect(parseTranscriptEvent({ event: "transcript.data", data: { data: { words: [] } } })).toBeNull();
  });
});

describe("parseBotStatusEvent", () => {
  it("spots the end of a call in both event styles", () => {
    expect(parseBotStatusEvent({ event: "bot.call_ended", data: { bot: { id: "b1" } } })).toMatchObject({ botId: "b1", ended: true });
    expect(parseBotStatusEvent({ event: "bot.in_call_recording", data: { bot: { id: "b1" } } })?.ended).toBe(false);
    expect(
      parseBotStatusEvent({ event: "bot.status_change", data: { bot_id: "b2", status: { code: "done" } } }),
    ).toMatchObject({ botId: "b2", ended: true });
  });
});

describe("createBotBody", () => {
  it("asks for real-time transcript lines and the join message", () => {
    const body = createBotBody({ meetingUrl: "https://meet.google.com/abc", transcriptWebhookUrl: "https://x/y", callId: "c1" });
    expect(body.bot_name).toBe("ABU Notetaker");
    expect(body.recording_config.realtime_endpoints[0]).toEqual({ type: "webhook", url: "https://x/y", events: ["transcript.data"] });
    expect(body.chat.on_bot_join.send_to).toBe("everyone");
    expect(body.chat.on_bot_join.message).not.toMatch(/[!:—]/);
  });
});

describe("isMeetingUrl", () => {
  it("only allows Zoom and Meet links over https", () => {
    expect(isMeetingUrl("https://us02web.zoom.us/j/123?pwd=x")).toBe(true);
    expect(isMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isMeetingUrl("http://meet.google.com/abc")).toBe(false);
    expect(isMeetingUrl("https://zoom.us.evil.com/j/1")).toBe(false);
    expect(isMeetingUrl("not a url")).toBe(false);
  });
});
