import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/** A throwaway database, resolved before the db module is imported. */
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "salesfloor-webhook-"));
process.env.SALESFLOOR_DB_PATH = path.join(TMP_DIR, "test.db");
process.env.SALESFLOOR_SEED_DEMO = "false";

let sync: typeof import("@/lib/ghl/sync");
let db: typeof import("@/lib/sales-db");
let repId: string;

beforeAll(async () => {
  db = await import("@/lib/sales-db");
  sync = await import("@/lib/ghl/sync");
  repId = db.upsertRep({ name: "Linked Rep", ghlUserId: "ghl-user-1" }).id;
});

describe("handleGhlWebhook", () => {
  it("turns a won opportunity into leaderboard revenue and a celebration", () => {
    const outcome = sync.handleGhlWebhook({
      type: "OpportunityStatusUpdate",
      id: "evt-won-1",
      status: "won",
      userId: "ghl-user-1",
      monetaryValue: 4200,
      opportunity: { name: "Northwind — annual plan" },
    });

    expect(outcome.handled).toBe(true);

    const entry = db.leaderboard("all", "revenue").find((e) => e.id === repId);
    expect(entry?.revenueCents).toBe(420_000);
    expect(entry?.deals).toBe(1);

    expect(db.listCelebrations(5).some((c) => c.kind === "deal_won")).toBe(true);
  });

  it("ignores a redelivery of the same event rather than paying twice", () => {
    const event = {
      type: "OpportunityStatusUpdate",
      id: "evt-won-2",
      status: "won",
      userId: "ghl-user-1",
      monetaryValue: 1000,
    };

    expect(sync.handleGhlWebhook(event).handled).toBe(true);
    const after = db.leaderboard("all", "revenue").find((e) => e.id === repId)?.revenueCents;

    const second = sync.handleGhlWebhook(event);
    expect(second.handled).toBe(false);
    expect(second.reason).toMatch(/duplicate/i);
    expect(db.leaderboard("all", "revenue").find((e) => e.id === repId)?.revenueCents).toBe(after);
  });

  it("records an appointment without inventing revenue", () => {
    const before = db.leaderboard("all", "revenue").find((e) => e.id === repId)?.revenueCents;

    expect(
      sync.handleGhlWebhook({
        type: "AppointmentCreate",
        id: "evt-appt-1",
        userId: "ghl-user-1",
      }).handled,
    ).toBe(true);

    expect(db.leaderboard("all", "revenue").find((e) => e.id === repId)?.revenueCents).toBe(before);
    expect(db.listActivities({ repId }).some((a) => a.type === "appointment_set")).toBe(true);
  });

  it("declines an event for a user no rep is linked to", () => {
    const outcome = sync.handleGhlWebhook({
      type: "OpportunityStatusUpdate",
      id: "evt-3",
      status: "won",
      userId: "nobody",
    });
    expect(outcome.handled).toBe(false);
    expect(outcome.reason).toMatch(/No rep linked/);
  });

  it("declines a payload with no event type at all", () => {
    expect(sync.handleGhlWebhook({}).handled).toBe(false);
  });
});
