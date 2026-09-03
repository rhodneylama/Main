import type { ActivityType, BadgeDef, Level } from "./types";

/**
 * Default points per activity. Deliberately weighted so that outcomes beat
 * effort — a booked meeting is worth more than twenty dials — while still
 * rewarding the activity that produces those outcomes.
 *
 * Managers can override any of these in Settings; DEFAULT_POINT_RULES is only
 * the starting point.
 */
export const DEFAULT_POINT_RULES: Record<ActivityType, number> = {
  call: 2,
  conversation: 5,
  email: 1,
  sms: 1,
  appointment_set: 25,
  appointment_held: 40,
  proposal_sent: 30,
  deal_won: 100,
  deal_lost: 5,
  training_call: 10,
  material_completed: 15,
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: "Dial",
  conversation: "Conversation",
  email: "Email sent",
  sms: "Text sent",
  appointment_set: "Appointment set",
  appointment_held: "Appointment held",
  proposal_sent: "Proposal sent",
  deal_won: "Deal won",
  deal_lost: "Deal lost",
  training_call: "Practice call",
  material_completed: "Training completed",
};

/** Activity types a rep can log by hand. The rest arrive from GHL or the trainer. */
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = [
  "call",
  "conversation",
  "email",
  "sms",
  "appointment_set",
  "appointment_held",
  "proposal_sent",
];

/**
 * A deal won is worth its activity points plus a slice of its value, so a
 * £60k deal outranks a £6k one on the board without swamping it entirely.
 */
export const POINTS_PER_1000_REVENUE = 10;

export function dealWonPoints(
  valueCents: number,
  rules: Record<ActivityType, number> = DEFAULT_POINT_RULES,
): number {
  const revenuePoints = Math.round((valueCents / 100 / 1000) * POINTS_PER_1000_REVENUE);
  return rules.deal_won + Math.max(0, revenuePoints);
}

export function pointsFor(
  type: ActivityType,
  valueCents = 0,
  rules: Record<ActivityType, number> = DEFAULT_POINT_RULES,
): number {
  if (type === "deal_won") return dealWonPoints(valueCents, rules);
  return rules[type] ?? 0;
}

/**
 * Practice calls pay out on quality, not attendance — a 90+ scorecard is worth
 * three times a bare pass, and an unscored call earns nothing.
 */
export function trainingCallPoints(
  overallScore: number | null,
  rules: Record<ActivityType, number> = DEFAULT_POINT_RULES,
): number {
  if (overallScore === null) return 0;
  const base = rules.training_call;
  if (overallScore >= 90) return base * 3;
  if (overallScore >= 75) return base * 2;
  if (overallScore >= 60) return base;
  return Math.round(base / 2);
}

/* ------------------------------------------------------------------ levels */

/**
 * Lifetime point thresholds. Calibrated against a full desk: a rep making
 * ~40 dials a day earns roughly 1,500-2,000 points a month before any deal
 * closes, so these span a couple of years rather than a couple of weeks.
 */
export const LEVELS: Level[] = [
  { level: 1, name: "Rookie", minPoints: 0 },
  { level: 2, name: "Dialer", minPoints: 750 },
  { level: 3, name: "Closer in training", minPoints: 2500 },
  { level: 4, name: "Closer", minPoints: 6000 },
  { level: 5, name: "Top performer", minPoints: 10000 },
  { level: 6, name: "Rainmaker", minPoints: 18000 },
  { level: 7, name: "Legend", minPoints: 32000 },
];

export function levelFor(points: number): Level {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.minPoints) current = level;
  }
  return current;
}

/** Progress toward the next level, 0-1. Returns 1 at the top level. */
export function levelProgress(points: number): number {
  const current = levelFor(points);
  const next = LEVELS.find((l) => l.level === current.level + 1);
  if (!next) return 1;
  const span = next.minPoints - current.minPoints;
  return Math.min(1, Math.max(0, (points - current.minPoints) / span));
}

/* ------------------------------------------------------------------ badges */

export const BADGES: BadgeDef[] = [
  {
    key: "first_blood",
    name: "First Blood",
    description: "Closed your first deal on the board.",
    icon: "🩸",
  },
  {
    key: "century",
    name: "Century",
    description: "Logged 100 dials.",
    icon: "💯",
  },
  {
    key: "closer",
    name: "Closer",
    description: "Won 10 deals.",
    icon: "🏆",
  },
  {
    key: "big_game",
    name: "Big Game",
    description: "Closed a single deal worth 10k or more.",
    icon: "🐘",
  },
  {
    key: "booked_solid",
    name: "Booked Solid",
    description: "Set 25 appointments.",
    icon: "📅",
  },
  {
    key: "quota_crusher",
    name: "Quota Crusher",
    description: "Beat your monthly quota.",
    icon: "🚀",
  },
  {
    key: "student",
    name: "Student of the Game",
    description: "Completed 10 training materials.",
    icon: "📚",
  },
  {
    key: "practice_ace",
    name: "Practice Ace",
    description: "Scored 90+ on a practice call.",
    icon: "🎯",
  },
];

export const BADGES_BY_KEY: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.key, b]),
);

/** The counters badge rules are evaluated against. */
export interface BadgeStats {
  dealsWon: number;
  dials: number;
  appointmentsSet: number;
  largestDealCents: number;
  materialsCompleted: number;
  bestPracticeScore: number;
  quotaAttainment: number;
}

/** Returns the badge keys a rep has earned, given their lifetime counters. */
export function earnedBadges(stats: BadgeStats): string[] {
  const earned: string[] = [];
  if (stats.dealsWon >= 1) earned.push("first_blood");
  if (stats.dials >= 100) earned.push("century");
  if (stats.dealsWon >= 10) earned.push("closer");
  if (stats.largestDealCents >= 1_000_000) earned.push("big_game");
  if (stats.appointmentsSet >= 25) earned.push("booked_solid");
  if (stats.quotaAttainment >= 1) earned.push("quota_crusher");
  if (stats.materialsCompleted >= 10) earned.push("student");
  if (stats.bestPracticeScore >= 90) earned.push("practice_ace");
  return earned;
}
