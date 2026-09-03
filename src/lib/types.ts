export type CallType = "cold_call" | "discovery" | "closing" | "follow_up";

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** How hard the prospect is to keep on the phone at each difficulty level. */
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Warm — curious and patient",
  2: "Receptive — mild pushback",
  3: "Realistic — busy, needs a reason to stay",
  4: "Tough — hostile open, stacked objections",
  5: "Brutal — actively trying to end the call",
};

export interface Persona {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  /** 1-5, see DIFFICULTY_LABELS. */
  difficulty: Difficulty;
  /** Emotional starting state, e.g. "annoyed, between meetings". */
  mood: string;
  /** Free-text personality notes the model uses to stay in character. */
  personality: string;
  /** The objections this prospect reaches for, in rough order of preference. */
  objections: string[];
  /** What would actually make this person agree to a meeting. */
  winCondition: string;
  /** Which call types this persona is suitable for. */
  callTypes: CallType[];
  /** Optional voice hint for speech synthesis. */
  voiceHint?: "male" | "female" | "neutral";
  /** Seeded personas ship with the app and cannot be deleted. */
  builtIn: boolean;
  createdAt: string;
}

export type Speaker = "rep" | "prospect";

export interface Turn {
  speaker: Speaker;
  text: string;
  /** Milliseconds from the start of the call. */
  at: number;
}

export interface ProductContext {
  /** What you sell, in the rep's own words. */
  product: string;
  /** Who you sell it to. */
  icp: string;
  /** The pitch or opener reps are expected to use. */
  pitch: string;
  /** Differentiators, proof points, pricing guardrails. */
  proofPoints: string;
  /** Known objections from the real market, so prospects raise realistic ones. */
  commonObjections: string;
}

export interface ScoreBreakdown {
  opener: number;
  objectionHandling: number;
  discovery: number;
  talkListenBalance: number;
  closing: number;
}

export interface Scorecard {
  /** 0-100 overall. */
  overall: number;
  breakdown: ScoreBreakdown;
  meetingBooked: boolean;
  /** Fraction of words spoken by the rep, 0-1. */
  repTalkRatio: number;
  fillerWords: { word: string; count: number }[];
  strengths: string[];
  improvements: string[];
  /** Specific rewrite suggestions tied to moments in the call. */
  coaching: {
    moment: string;
    whatHappened: string;
    tryInstead: string;
  }[];
  summary: string;
}

export interface CallRecord {
  id: string;
  repName: string;
  personaId: string;
  personaName: string;
  callType: CallType;
  difficulty: Difficulty;
  startedAt: string;
  /** Call length in seconds. */
  durationSec: number;
  transcript: Turn[];
  scorecard: Scorecard | null;
}

export interface RepStats {
  repName: string;
  calls: number;
  avgScore: number;
  bestScore: number;
  meetingsBooked: number;
  lastCallAt: string;
}

/* ==========================================================================
   Sales floor — teams, reps, deals, activity
   ========================================================================== */

export interface Team {
  id: string;
  name: string;
  /** Categorical palette slot 1-5, used consistently wherever the team appears. */
  colorSlot: number;
  createdAt: string;
}

export interface Rep {
  id: string;
  name: string;
  email: string;
  teamId: string | null;
  /** Shown as the rep's avatar — emoji keeps this dependency-free. */
  avatar: string;
  role: "rep" | "manager" | "admin";
  /** Monthly revenue target in cents. 0 means "no quota set". */
  quotaCents: number;
  /** GoHighLevel user id, when this rep is linked to a GHL seat. */
  ghlUserId: string | null;
  active: boolean;
  createdAt: string;
}

/**
 * Everything a rep does that is worth points. Deal outcomes are recorded as
 * activities too, so the leaderboard has a single source of truth.
 */
export type ActivityType =
  | "call"
  | "conversation"
  | "email"
  | "sms"
  | "appointment_set"
  | "appointment_held"
  | "proposal_sent"
  | "deal_won"
  | "deal_lost"
  | "training_call"
  | "material_completed";

export type ActivitySource = "manual" | "ghl" | "trainer" | "seed";

export interface Activity {
  id: string;
  repId: string;
  type: ActivityType;
  /** Short human label, e.g. "Discovery call — Northwind Logistics". */
  subject: string;
  points: number;
  /** Revenue attached to this activity in cents; 0 for non-revenue activity. */
  valueCents: number;
  occurredAt: string;
  source: ActivitySource;
  /** Id in the source system, used to make syncing idempotent. */
  externalId: string | null;
  dealId: string | null;
}

export type DealStatus = "open" | "won" | "lost" | "abandoned";

export interface Deal {
  id: string;
  name: string;
  contactName: string;
  repId: string | null;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  /** Position of the stage in its pipeline, so funnels order correctly. */
  stageOrder: number;
  status: DealStatus;
  valueCents: number;
  source: ActivitySource;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  source: ActivitySource;
}

/* ------------------------------------------------------- gamification ---- */

export interface Level {
  level: number;
  name: string;
  /** Cumulative points required to reach this level. */
  minPoints: number;
}

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  icon: string;
}

export interface AwardedBadge extends BadgeDef {
  awardedAt: string;
}

export type LeaderboardMetric = "points" | "revenue" | "deals" | "activities";

export type LeaderboardPeriod = "today" | "week" | "month" | "quarter" | "all";

export interface LeaderboardEntry {
  rank: number;
  /** Rep id, or team id when the board is scoped to teams. */
  id: string;
  name: string;
  avatar: string;
  teamId: string | null;
  teamName: string | null;
  colorSlot: number;
  points: number;
  revenueCents: number;
  deals: number;
  activities: number;
  /** Value of the metric the board is currently sorted by. */
  value: number;
  level: Level;
  badges: AwardedBadge[];
}

export type CompetitionMetric = LeaderboardMetric;

export type CompetitionScope = "rep" | "team";

export interface Competition {
  id: string;
  name: string;
  description: string;
  metric: CompetitionMetric;
  scope: CompetitionScope;
  startsAt: string;
  endsAt: string;
  /** Target value to hit, in the metric's own unit; 0 means "no target". */
  target: number;
  prize: string;
  createdAt: string;
}

export interface CompetitionStanding {
  rank: number;
  id: string;
  name: string;
  avatar: string;
  colorSlot: number;
  value: number;
  /** Progress toward the target, 0-1. Always 0 when no target is set. */
  progress: number;
}

export type CelebrationKind =
  | "deal_won"
  | "appointment_set"
  | "badge"
  | "level_up"
  | "competition_won"
  | "training_ace";

export interface Celebration {
  id: string;
  repId: string;
  repName: string;
  avatar: string;
  colorSlot: number;
  kind: CelebrationKind;
  headline: string;
  detail: string;
  valueCents: number;
  createdAt: string;
}

/* ---------------------------------------------------------- training ----- */

export type MaterialKind = "pdf" | "video" | "image" | "link" | "doc";

export interface Material {
  id: string;
  title: string;
  description: string;
  kind: MaterialKind;
  category: string;
  /** External URL for link/video materials. */
  url: string | null;
  /** Stored filename under the uploads directory, for uploaded files. */
  filePath: string | null;
  /** Original filename, shown in the UI and used for downloads. */
  fileName: string | null;
  sizeBytes: number;
  /** Rough time to consume, in minutes. 0 when unknown. */
  durationMin: number;
  /** Required materials appear in every rep's checklist. */
  required: boolean;
  points: number;
  createdAt: string;
}

export interface MaterialProgress {
  materialId: string;
  repId: string;
  completedAt: string;
}

export interface MaterialWithProgress extends Material {
  /** How many active reps have completed it. */
  completedBy: number;
  completedByMe: boolean;
}

/* --------------------------------------------------------- dashboard ---- */

export interface StageBreakdown {
  stageName: string;
  order: number;
  deals: number;
  valueCents: number;
}

export interface TrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  activities: number;
  revenueCents: number;
  points: number;
}

export interface DashboardData {
  wonRevenueCents: number;
  wonDeals: number;
  openPipelineCents: number;
  openDeals: number;
  activitiesToday: number;
  appointmentsSet: number;
  quotaCents: number;
  quotaAttainment: number;
  avgDealCents: number;
  winRate: number;
  stages: StageBreakdown[];
  trend: TrendPoint[];
  topReps: LeaderboardEntry[];
  celebrations: Celebration[];
}

/* ------------------------------------------------------------ GoHighLevel */

export interface GhlConfig {
  /** Private integration token. Never returned to the browser in full. */
  apiToken: string;
  locationId: string;
  /** Shared secret checked on inbound webhooks, when set. */
  webhookSecret: string;
  /** Pull deals and activity from GHL rather than relying on demo data. */
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

export interface GhlSyncResult {
  ok: boolean;
  pipelines: number;
  deals: number;
  reps: number;
  activities: number;
  message: string;
}
