import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINT_RULES,
  dealWonPoints,
  earnedBadges,
  levelFor,
  levelProgress,
  pointsFor,
  trainingCallPoints,
} from "@/lib/points";
import type { BadgeStats } from "@/lib/points";

describe("points", () => {
  it("pays the flat rule for effort activities", () => {
    expect(pointsFor("call")).toBe(DEFAULT_POINT_RULES.call);
    expect(pointsFor("appointment_set")).toBe(DEFAULT_POINT_RULES.appointment_set);
  });

  it("scales a won deal with its value", () => {
    // 10 points per 1,000 of revenue, on top of the flat deal_won award.
    expect(dealWonPoints(0)).toBe(DEFAULT_POINT_RULES.deal_won);
    expect(dealWonPoints(1_000_00)).toBe(DEFAULT_POINT_RULES.deal_won + 10);
    expect(dealWonPoints(10_000_00)).toBe(DEFAULT_POINT_RULES.deal_won + 100);
  });

  it("routes deal_won through the value-scaled payout", () => {
    expect(pointsFor("deal_won", 5_000_00)).toBe(dealWonPoints(5_000_00));
  });

  it("pays practice calls on quality, and nothing for an unscored call", () => {
    const base = DEFAULT_POINT_RULES.training_call;
    expect(trainingCallPoints(null)).toBe(0);
    expect(trainingCallPoints(40)).toBe(Math.round(base / 2));
    expect(trainingCallPoints(65)).toBe(base);
    expect(trainingCallPoints(80)).toBe(base * 2);
    expect(trainingCallPoints(95)).toBe(base * 3);
  });
});

describe("levels", () => {
  it("puts a new rep at level 1 and never past the top", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(-5).level).toBe(1);
    expect(levelFor(999_999).level).toBe(7);
  });

  it("lands exactly on a threshold as the new level", () => {
    expect(levelFor(750).name).toBe("Dialer");
    expect(levelFor(749).name).toBe("Rookie");
  });

  it("reports progress toward the next level, and 1 at the top", () => {
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(375)).toBeCloseTo(0.5);
    expect(levelProgress(999_999)).toBe(1);
  });
});

describe("badges", () => {
  const nothing: BadgeStats = {
    dealsWon: 0,
    dials: 0,
    appointmentsSet: 0,
    largestDealCents: 0,
    materialsCompleted: 0,
    bestPracticeScore: 0,
    quotaAttainment: 0,
  };

  it("awards nothing to a rep who has done nothing", () => {
    expect(earnedBadges(nothing)).toEqual([]);
  });

  it("awards on the first deal, and again at ten", () => {
    expect(earnedBadges({ ...nothing, dealsWon: 1 })).toContain("first_blood");
    expect(earnedBadges({ ...nothing, dealsWon: 1 })).not.toContain("closer");
    expect(earnedBadges({ ...nothing, dealsWon: 10 })).toContain("closer");
  });

  it("awards quota_crusher only once the quota is actually beaten", () => {
    expect(earnedBadges({ ...nothing, quotaAttainment: 0.99 })).not.toContain("quota_crusher");
    expect(earnedBadges({ ...nothing, quotaAttainment: 1 })).toContain("quota_crusher");
  });

  it("treats big_game as a single deal of 10k or more", () => {
    expect(earnedBadges({ ...nothing, largestDealCents: 999_999 })).not.toContain("big_game");
    expect(earnedBadges({ ...nothing, largestDealCents: 1_000_000 })).toContain("big_game");
  });
});
