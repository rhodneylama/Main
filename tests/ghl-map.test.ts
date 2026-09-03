import { describe, expect, it } from "vitest";
import {
  toCents,
  toDeal,
  toDealStatus,
  toPipeline,
  toRepFields,
  webhookActivityType,
  webhookExternalId,
} from "@/lib/ghl/map";
import type { Pipeline } from "@/lib/types";

const PIPELINE_PAYLOAD = {
  id: "pipe-1",
  name: "New Business",
  stages: [
    { id: "s3", name: "Proposal", position: 2 },
    { id: "s1", name: "New Lead", position: 0 },
    { id: "s2", name: "Qualified", position: 1 },
  ],
};

describe("toPipeline", () => {
  it("sorts stages by position regardless of payload order", () => {
    const pipeline = toPipeline(PIPELINE_PAYLOAD);
    expect(pipeline?.stages.map((s) => s.name)).toEqual(["New Lead", "Qualified", "Proposal"]);
  });

  it("falls back to array order when position is missing", () => {
    const pipeline = toPipeline({ id: "p", name: "P", stages: [{ name: "A" }, { name: "B" }] });
    expect(pipeline?.stages.map((s) => s.order)).toEqual([0, 1]);
  });

  it("rejects a payload with no id", () => {
    expect(toPipeline({ name: "No id" })).toBeNull();
  });
});

describe("toRepFields", () => {
  it("uses a whole name when GoHighLevel supplies one", () => {
    expect(toRepFields({ id: "u1", name: "Maya Okonjo", email: "m@x.com" })).toEqual({
      ghlUserId: "u1",
      name: "Maya Okonjo",
      email: "m@x.com",
    });
  });

  it("joins first and last name when it does not", () => {
    expect(toRepFields({ id: "u2", firstName: "Dev", lastName: "Ramanathan" })?.name).toBe(
      "Dev Ramanathan",
    );
  });
});

describe("value and status mapping", () => {
  it("converts currency units to cents", () => {
    expect(toCents(75)).toBe(7500);
    expect(toCents("120.50")).toBe(12050);
  });

  it("treats missing, negative and unparseable values as zero", () => {
    expect(toCents(undefined)).toBe(0);
    expect(toCents(-40)).toBe(0);
    expect(toCents("not a number")).toBe(0);
  });

  it("falls back to open for an unrecognised status", () => {
    expect(toDealStatus("won")).toBe("won");
    expect(toDealStatus("WON")).toBe("won");
    expect(toDealStatus("something-else")).toBe("open");
    expect(toDealStatus(undefined)).toBe("open");
  });
});

describe("toDeal", () => {
  const pipeline = toPipeline(PIPELINE_PAYLOAD) as Pipeline;
  const ctx = {
    pipelines: new Map([[pipeline.id, pipeline]]),
    repIdByGhlUser: new Map([["u1", "rep-local-1"]]),
  };

  const opportunity = {
    id: "opp-9",
    name: "Northwind — annual plan",
    monetaryValue: 8400,
    status: "won",
    pipelineId: "pipe-1",
    pipelineStageId: "s2",
    assignedTo: "u1",
    contact: { name: "Dana Whitmore" },
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
    lastStatusChangeAt: "2026-08-20T09:00:00.000Z",
  };

  it("resolves the stage, the rep and the value", () => {
    const deal = toDeal(opportunity, ctx);
    expect(deal).toMatchObject({
      externalId: "opp-9",
      stageName: "Qualified",
      stageOrder: 1,
      repId: "rep-local-1",
      valueCents: 840_000,
      status: "won",
      contactName: "Dana Whitmore",
    });
  });

  it("closes a won deal at its last status change", () => {
    expect(toDeal(opportunity, ctx)?.closedAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("leaves an open deal uncloseed", () => {
    expect(toDeal({ ...opportunity, status: "open" }, ctx)?.closedAt).toBeNull();
  });

  it("leaves an unassigned opportunity without a rep", () => {
    expect(toDeal({ ...opportunity, assignedTo: undefined }, ctx)?.repId).toBeNull();
  });

  it("survives an unknown pipeline rather than throwing", () => {
    const deal = toDeal({ ...opportunity, pipelineId: "missing" }, ctx);
    expect(deal?.stageName).toBe("Unassigned stage");
    expect(deal?.stageOrder).toBe(0);
  });
});

describe("webhookActivityType", () => {
  it("maps a won opportunity to deal_won and a lost one to deal_lost", () => {
    expect(webhookActivityType("OpportunityStatusUpdate", { status: "won" })).toBe("deal_won");
    expect(webhookActivityType("OpportunityStatusUpdate", { status: "lost" })).toBe("deal_lost");
    expect(webhookActivityType("OpportunityStatusUpdate", { status: "abandoned" })).toBe("deal_lost");
  });

  it("ignores an opportunity that is merely still open", () => {
    expect(webhookActivityType("OpportunityStatusUpdate", { status: "open" })).toBeNull();
  });

  it("maps outbound messages by channel", () => {
    expect(webhookActivityType("OutboundMessage", { messageType: "CALL" })).toBe("call");
    expect(webhookActivityType("OutboundMessage", { messageType: "SMS" })).toBe("sms");
    expect(webhookActivityType("OutboundMessage", { messageType: "Email" })).toBe("email");
    expect(webhookActivityType("OutboundMessage", { messageType: "WEBCHAT" })).toBeNull();
  });

  it("counts an appointment as held only once it shows", () => {
    expect(webhookActivityType("AppointmentCreate", {})).toBe("appointment_set");
    expect(webhookActivityType("AppointmentUpdate", { status: "showed" })).toBe("appointment_held");
    expect(webhookActivityType("AppointmentUpdate", { status: "noshow" })).toBeNull();
  });

  it("ignores event types it has no mapping for", () => {
    expect(webhookActivityType("ContactCreate", {})).toBeNull();
  });
});

describe("webhookExternalId", () => {
  it("is stable for the same event, so a redelivery is deduplicated", () => {
    const payload = { id: "evt-1", status: "won" };
    expect(webhookExternalId("OpportunityStatusUpdate", payload)).toBe(
      webhookExternalId("OpportunityStatusUpdate", payload),
    );
  });

  it("distinguishes different events of the same type", () => {
    expect(webhookExternalId("OpportunityStatusUpdate", { id: "a" })).not.toBe(
      webhookExternalId("OpportunityStatusUpdate", { id: "b" }),
    );
  });
});
