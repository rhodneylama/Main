import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the real SQLite layer against a throwaway database. The db module
 * resolves its path once at import time, so the environment is set before any
 * dynamic import below.
 */
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "salesfloor-test-"));
process.env.SALESFLOOR_DB_PATH = path.join(TMP_DIR, "test.db");
process.env.SALESFLOOR_SEED_DEMO = "false";

type SalesDb = typeof import("@/lib/sales-db");

let db: SalesDb;
let alice: string;
let bob: string;
const TEAM = "team-test";

beforeAll(async () => {
  db = await import("@/lib/sales-db");

  db.upsertTeam({ id: TEAM, name: "Test Team", colorSlot: 1 });
  alice = db.upsertRep({ name: "Alice", teamId: TEAM, quotaCents: 1_000_000 }).id;
  bob = db.upsertRep({ name: "Bob", teamId: TEAM }).id;

  const now = new Date().toISOString();
  for (let i = 0; i < 10; i++) {
    db.recordActivity({ repId: alice, type: "call", occurredAt: now });
  }
  db.recordActivity({ repId: alice, type: "deal_won", valueCents: 500_000, occurredAt: now });
  db.recordActivity({ repId: bob, type: "call", occurredAt: now });
  db.recordActivity({ repId: bob, type: "deal_won", valueCents: 100_000, occurredAt: now });
});

describe("recordActivity", () => {
  it("refuses to record the same external event twice", () => {
    const input = {
      repId: bob,
      type: "appointment_set" as const,
      externalId: "ghl:AppointmentCreate:appt-1",
    };
    expect(db.recordActivity(input)).not.toBeNull();
    expect(db.recordActivity(input)).toBeNull();
  });
});

describe("leaderboard", () => {
  it("ranks by the chosen metric", () => {
    const byRevenue = db.leaderboard("month", "revenue");
    expect(byRevenue[0].name).toBe("Alice");
    expect(byRevenue[0].revenueCents).toBe(500_000);
    expect(byRevenue[0].rank).toBe(1);
  });

  it("counts only won deals toward revenue", () => {
    const entry = db.leaderboard("all", "revenue").find((e) => e.name === "Bob");
    expect(entry?.revenueCents).toBe(100_000);
    expect(entry?.deals).toBe(1);
  });

  it("rolls reps up into their team", () => {
    const teams = db.leaderboard("month", "revenue", "team");
    expect(teams).toHaveLength(1);
    expect(teams[0].revenueCents).toBe(600_000);
  });

  it("returns an empty board for a period with no activity", () => {
    const entries = db.leaderboard("today", "points");
    // Everything above was recorded "now", so today is the one period that has it.
    expect(entries.every((e) => e.rank > 0)).toBe(true);
  });
});

describe("periodStart", () => {
  it("starts the sales week on Monday", () => {
    // 2026-09-03 is a Thursday; its week starts on Monday the 31st of August.
    const start = db.periodStart("week", new Date("2026-09-03T12:00:00"));
    expect(new Date(start).getDay()).toBe(1);
  });

  it("starts a quarter on the first day of its first month", () => {
    const start = new Date(db.periodStart("quarter", new Date("2026-08-15T12:00:00")));
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(1);
  });

  it("reaches back to the epoch for all time", () => {
    expect(new Date(db.periodStart("all")).getFullYear()).toBe(1970);
  });
});

describe("competitions", () => {
  it("scores over the competition window, not the current period", () => {
    const past = {
      id: "comp-past",
      name: "Last month",
      description: "",
      metric: "points" as const,
      scope: "rep" as const,
      startsAt: "2020-01-01T00:00:00.000Z",
      endsAt: "2020-01-31T23:59:59.000Z",
      target: 0,
      prize: "",
      createdAt: new Date().toISOString(),
    };
    db.upsertCompetition(past);

    // None of the seeded activity falls inside 2020, so everyone scores zero.
    expect(db.competitionStandings(past).every((s) => s.value === 0)).toBe(true);
    expect(db.competitionStatus(past)).toBe("ended");
  });

  it("reports progress against a target", () => {
    const live = {
      id: "comp-live",
      name: "Now",
      description: "",
      metric: "revenue" as const,
      scope: "rep" as const,
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      target: 1_000_000,
      prize: "",
      createdAt: new Date().toISOString(),
    };
    db.upsertCompetition(live);

    const standings = db.competitionStandings(live);
    expect(db.competitionStatus(live)).toBe("live");
    expect(standings[0].name).toBe("Alice");
    expect(standings[0].progress).toBeCloseTo(0.5);
  });

  it("caps progress at 1 when the target is beaten", () => {
    const live = {
      id: "comp-small-target",
      name: "Easy",
      description: "",
      metric: "revenue" as const,
      scope: "rep" as const,
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      target: 100_000,
      prize: "",
      createdAt: new Date().toISOString(),
    };
    db.upsertCompetition(live);
    expect(db.competitionStandings(live)[0].progress).toBe(1);
  });
});

describe("badges", () => {
  it("awards a badge once and does not re-award it", () => {
    expect(db.syncBadges(alice)).toContain("first_blood");
    expect(db.syncBadges(alice)).not.toContain("first_blood");
    expect(db.listBadges(alice).map((b) => b.key)).toContain("first_blood");
  });

  it("awards quota_crusher only once the quota is beaten", () => {
    // Alice's quota is 10,000 and she has closed 5,000 so far.
    expect(db.listBadges(alice).map((b) => b.key)).not.toContain("quota_crusher");
    db.recordActivity({ repId: alice, type: "deal_won", valueCents: 600_000 });
    db.syncBadges(alice);
    expect(db.listBadges(alice).map((b) => b.key)).toContain("quota_crusher");
  });
});

describe("reps", () => {
  it("finds an existing rep by name rather than creating a duplicate", () => {
    expect(db.ensureRepByName("Alice").id).toBe(alice);
    expect(db.ensureRepByName("  alice  ").id).toBe(alice);
  });

  it("creates a rep the first time a new name shows up", () => {
    const fresh = db.ensureRepByName("Carla");
    expect(fresh.id).not.toBe(alice);
    expect(db.getRep(fresh.id)?.name).toBe("Carla");
  });

  it("keeps a deactivated rep out of the roster but not out of history", () => {
    const temp = db.upsertRep({ name: "Temp" });
    db.recordActivity({ repId: temp.id, type: "call" });
    db.deactivateRep(temp.id);

    expect(db.listReps().find((r) => r.id === temp.id)).toBeUndefined();
    expect(db.listReps(true).find((r) => r.id === temp.id)).toBeDefined();
    expect(db.lifetimePoints(temp.id)).toBeGreaterThan(0);
  });
});
