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
