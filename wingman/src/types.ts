/**
 * Wingman's data model.
 *
 * A Call is one discovery call, live or replayed. While it runs, Utterances
 * stream in, and every analysis pass folds what Claude heard into the
 * CallState. Everything Wingman shows on the private page goes out as a
 * WingmanEvent, and the same events are stored so a call can be reviewed later.
 */

export type CallSource = "replay" | "live";
export type CallStatus = "running" | "ended" | "failed";

export interface Call {
  id: string;
  source: CallSource;
  status: CallStatus;
  /** Zoom or Meet link for live calls, transcript file name for replays. */
  origin: string;
  prospectCompany: string | null;
  prospectWebsite: string | null;
  repNames: string[];
  startedAt: number;
  endedAt: number | null;
  /** Recall.ai bot id, live calls only. */
  recallBotId: string | null;
  /** Filled after the call (step 3). */
  summary: string | null;
  recapEmailDraft: string | null;
}

export interface Utterance {
  seq: number;
  speaker: string;
  isRep: boolean;
  text: string;
  /** Milliseconds from the start of the call. */
  atMs: number;
}

export interface Pain {
  label: string;
  quote: string;
  solution: string;
}

/** Discovery checklist. Every field stays null until the prospect states it. */
export interface DiscoveryForm {
  trade: string | null;
  yearsInBusiness: string | null;
  trucks: string | null;
  jobsPerMonth: string | null;
  averageTicket: string | null;
  whoAnswersPhones: string | null;
  officeStaff: string | null;
  needsHelpWith: string | null;
  leadSources: string | null;
  coverageWanted: string | null;
  callMix: string | null;
}

export const DISCOVERY_FIELDS: { key: keyof DiscoveryForm; label: string }[] = [
  { key: "trade", label: "Trade" },
  { key: "yearsInBusiness", label: "Years in business" },
  { key: "trucks", label: "Trucks" },
  { key: "jobsPerMonth", label: "Jobs a month" },
  { key: "averageTicket", label: "Average ticket" },
  { key: "whoAnswersPhones", label: "Who answers phones" },
  { key: "officeStaff", label: "Office staff" },
  { key: "needsHelpWith", label: "Needs help with" },
  { key: "leadSources", label: "Lead sources" },
  { key: "coverageWanted", label: "Coverage wanted" },
  { key: "callMix", label: "Call mix" },
];

export function emptyForm(): DiscoveryForm {
  return {
    trade: null,
    yearsInBusiness: null,
    trucks: null,
    jobsPerMonth: null,
    averageTicket: null,
    whoAnswersPhones: null,
    officeStaff: null,
    needsHelpWith: null,
    leadSources: null,
    coverageWanted: null,
    callMix: null,
  };
}

export const ABU_SERVICES = [
  "Dedicated Agent",
  "Appointment Setting",
  "Live Answering",
  "AI Hybrid",
  "Strictly AI",
] as const;
export type AbuService = (typeof ABU_SERVICES)[number];

export interface FitSuggestion {
  service: AbuService;
  reason: string;
}

export const LOOKUP_KINDS = ["town", "competitor", "software", "certification", "other"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

export interface Lookup {
  query: string;
  kind: LookupKind;
  why: string;
}

export interface ResearchNote {
  query: string;
  kind: LookupKind;
  summary: string;
  atMs: number;
}

export const NUDGE_KINDS = ["discovery", "quantify", "redirect", "fit", "rapport", "close"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];

export interface Nudge {
  text: string;
  kind: NudgeKind;
  atMs: number;
  /** Utterance seq the nudge was produced after, for lining up in review. */
  afterSeq: number;
  /** Copy-rule problems the filter could not fix on its own. */
  copyWarnings: string[];
}

/** Everything Wingman knows so far, carried from one analysis pass to the next. */
export interface CallState {
  pains: Pain[];
  form: DiscoveryForm;
  fit: FitSuggestion[];
  research: ResearchNote[];
  /** Queries already sent to research, so the same town is not looked up twice. */
  lookedUp: string[];
  nudges: Nudge[];
}

export function emptyState(): CallState {
  return { pains: [], form: emptyForm(), fit: [], research: [], lookedUp: [], nudges: [] };
}

/** What one analysis pass returns, after validation. */
export interface Analysis {
  nudge: string;
  nudgeKind: NudgeKind;
  pains: Pain[];
  form: DiscoveryForm;
  fit: FitSuggestion[];
  lookups: Lookup[];
}

/** Written once the call ends. Shown for review, never sent anywhere. */
export interface PostCall {
  summary: string;
  nextSteps: string[];
  recapEmail: { subject: string; body: string };
}

export type WingmanEvent =
  | { type: "call"; call: Call }
  | { type: "utterance"; utterance: Utterance }
  | { type: "nudge"; nudge: Nudge }
  | { type: "state"; state: Omit<CallState, "nudges" | "lookedUp"> }
  | { type: "research"; note: ResearchNote }
  | { type: "status"; status: CallStatus; message?: string }
  | { type: "postcall"; postCall: PostCall }
  | { type: "error"; message: string };
