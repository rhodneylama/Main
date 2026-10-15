import { describe, expect, it } from "vitest";
import type { Brain } from "../src/brain/index.js";
import { CallSession } from "../src/loop/session.js";
import { emptyForm, type Call, type WingmanEvent } from "../src/types.js";

const call: Call = {
  id: "t",
  source: "replay",
  status: "running",
  origin: "test",
  prospectCompany: null,
  prospectWebsite: null,
  repNames: ["Rep"],
  startedAt: 0,
  endedAt: null,
  recallBotId: null,
  summary: null,
  recapEmailDraft: null,
};

function recordingBrain(nudge = "") {
  const passes: { newFromSeq: number; lastSeq: number }[] = [];
  const brain: Brain = {
    async analyze({ recent, newFromSeq }) {
      passes.push({ newFromSeq, lastSeq: recent[recent.length - 1].seq });
      return {
        nudge,
        nudgeKind: "discovery",
        pains: [],
        form: emptyForm(),
        fit: [],
        lookups: passes.length === 1 ? [{ query: "Plano", kind: "town", why: "service area" }] : [],
      };
    },
    async research() {
      return "Plano is a north Dallas suburb.\nAbout 290 thousand people.";
    },
  };
  return { brain, passes };
}

describe("CallSession", () => {
  it("runs a pass when the prospect finishes a real turn", async () => {
    const { brain, passes } = recordingBrain();
    const s = new CallSession(call, brain, { intervalMs: 60_000, research: false });
    s.addUtterance("Rep", "How many trucks?", 1000);
    s.addUtterance("Owner", "We run six trucks across Plano and Frisco.", 2000);
    s.addUtterance("Rep", "Nice.", 5000);
    await s.settle();
    expect(passes).toEqual([{ newFromSeq: 0, lastSeq: 1 }]);
  });

  it("does not run a pass on a one word reply", async () => {
    const { brain, passes } = recordingBrain();
    const s = new CallSession(call, brain, { intervalMs: 60_000, research: false });
    s.addUtterance("Rep", "So we have three options.", 1000);
    s.addUtterance("Owner", "Okay.", 2000);
    s.addUtterance("Rep", "The first one is", 3000);
    await s.settle();
    expect(passes).toEqual([]);
  });

  it("runs a pass after a full interval of talking", async () => {
    const { brain, passes } = recordingBrain();
    const s = new CallSession(call, brain, { intervalMs: 10_000, research: false });
    s.addUtterance("Owner", "So it started in my garage.", 4000);
    s.addUtterance("Owner", "Then we bought a second van.", 15_000);
    await s.settle();
    expect(passes).toEqual([{ newFromSeq: 0, lastSeq: 1 }]);
  });

  it("starts the interval at the first line, not at zero", async () => {
    const { brain, passes } = recordingBrain();
    const s = new CallSession(call, brain, { intervalMs: 10_000, research: false });
    s.addUtterance("Rep", "Hello.", 81_000);
    s.addUtterance("Owner", "Hi.", 88_000);
    await s.settle();
    expect(passes).toEqual([]);
  });

  it("queues one follow-up pass for lines that arrive mid-pass", async () => {
    const { brain, passes } = recordingBrain();
    const s = new CallSession(call, brain, { intervalMs: 1000, research: false });
    s.addUtterance("Owner", "We miss a lot of calls after five.", 2000);
    s.addUtterance("Owner", "Probably twenty a week.", 3500);
    s.addUtterance("Owner", "Maybe more in July.", 5000);
    await s.settle();
    expect(passes).toEqual([
      { newFromSeq: 0, lastSeq: 1 },
      { newFromSeq: 2, lastSeq: 2 },
    ]);
  });

  it("emits nudges and research, and feeds research back as known", async () => {
    const { brain } = recordingBrain("Ask how many after hours calls go to voicemail");
    const s = new CallSession(call, brain, { intervalMs: 60_000, research: true });
    const events: WingmanEvent[] = [];
    s.on("event", (e) => events.push(e));
    s.addUtterance("Owner", "We cover Plano and we miss calls after five.", 1000);
    s.addUtterance("Rep", "How many?", 4000);
    await s.settle();
    expect(events.filter((e) => e.type === "nudge")).toHaveLength(1);
    expect(s.state.research.map((r) => r.query)).toEqual(["Plano"]);
  });
});
