import type { ActivityType, Deal, DealStatus, Pipeline, PipelineStage } from "../types";

/**
 * Pure translations from GoHighLevel payloads to this app's domain objects.
 * Kept free of database access so they can be unit-tested against real payload
 * samples, and defensive because GHL omits fields rather than nulling them.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toPipeline(raw: any): Pipeline | null {
  if (!raw?.id) return null;
  const stages: PipelineStage[] = (raw.stages ?? [])
    .map((s: any, i: number) => ({
      id: String(s.id ?? `${raw.id}-stage-${i}`),
      name: String(s.name ?? `Stage ${i + 1}`),
      order: typeof s.position === "number" ? s.position : i,
    }))
    .sort((a: PipelineStage, b: PipelineStage) => a.order - b.order);

  return {
    id: String(raw.id),
    name: String(raw.name ?? "Pipeline"),
    stages,
    source: "ghl",
  };
}

/** GHL user records vary by endpoint; name may be whole or split. */
export function toRepFields(raw: any): { ghlUserId: string; name: string; email: string } | null {
  if (!raw?.id) return null;
  const name =
    raw.name ??
    [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim() ??
    "";
  if (!name) return null;
  return {
    ghlUserId: String(raw.id),
    name: String(name),
    email: String(raw.email ?? ""),
  };
}

const DEAL_STATUSES: DealStatus[] = ["open", "won", "lost", "abandoned"];

export function toDealStatus(raw: unknown): DealStatus {
  const value = String(raw ?? "open").toLowerCase();
  return (DEAL_STATUSES as string[]).includes(value) ? (value as DealStatus) : "open";
}

/** GHL reports opportunity value in whole currency units; we store cents. */
export function toCents(monetaryValue: unknown): number {
  const n = typeof monetaryValue === "number" ? monetaryValue : Number(monetaryValue ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export interface DealMapContext {
  /** Pipeline id -> pipeline, used to resolve stage names and ordering. */
  pipelines: Map<string, Pipeline>;
  /** GHL user id -> local rep id. Unassigned opportunities map to null. */
  repIdByGhlUser: Map<string, string>;
}

export function toDeal(raw: any, ctx: DealMapContext): Deal | null {
  if (!raw?.id) return null;

  const pipeline = ctx.pipelines.get(String(raw.pipelineId ?? ""));
  const stageId = String(raw.pipelineStageId ?? "");
  const stage = pipeline?.stages.find((s) => s.id === stageId);
  const assignedTo = raw.assignedTo ? String(raw.assignedTo) : "";
  const status = toDealStatus(raw.status);
  const createdAt = String(raw.createdAt ?? new Date().toISOString());
  const updatedAt = String(raw.updatedAt ?? createdAt);

  return {
    id: `ghl-${raw.id}`,
    name: String(raw.name ?? "Untitled opportunity"),
    contactName: String(raw.contact?.name ?? raw.contactName ?? ""),
    repId: ctx.repIdByGhlUser.get(assignedTo) ?? null,
    pipelineId: String(raw.pipelineId ?? "unknown"),
    pipelineName: pipeline?.name ?? "Pipeline",
    stageId: stageId || "unknown",
    stageName: stage?.name ?? "Unassigned stage",
    stageOrder: stage?.order ?? 0,
    status,
    valueCents: toCents(raw.monetaryValue),
    source: "ghl",
    externalId: String(raw.id),
    createdAt,
    updatedAt,
    closedAt:
      status === "open" ? null : String(raw.lastStatusChangeAt ?? raw.updatedAt ?? updatedAt),
  };
}

/**
 * Maps a GoHighLevel webhook event type to the activity it represents.
 * Unmapped event types return null and are acknowledged without being stored.
 */
export function webhookActivityType(eventType: string, payload: any = {}): ActivityType | null {
  switch (eventType) {
    case "OpportunityStatusUpdate":
    case "OpportunityStageUpdate": {
      const status = toDealStatus(payload.status);
      if (status === "won") return "deal_won";
      if (status === "lost" || status === "abandoned") return "deal_lost";
      return null;
    }
    case "AppointmentCreate":
      return "appointment_set";
    case "AppointmentUpdate":
      // Only a completed appointment counts as held.
      return String(payload.appointment?.status ?? payload.status ?? "") === "showed"
        ? "appointment_held"
        : null;
    case "OutboundMessage": {
      const type = String(payload.messageType ?? payload.type ?? "").toUpperCase();
      if (type.includes("CALL")) return "call";
      if (type.includes("EMAIL")) return "email";
      if (type.includes("SMS")) return "sms";
      return null;
    }
    case "InboundMessage": {
      const type = String(payload.messageType ?? payload.type ?? "").toUpperCase();
      return type.includes("CALL") ? "conversation" : null;
    }
    default:
      return null;
  }
}

/**
 * A stable id for a webhook event, so redelivering the same event does not pay
 * points twice. Falls back to the event type plus timestamp when GHL gives us
 * nothing more specific.
 */
export function webhookExternalId(eventType: string, payload: any = {}): string {
  const id =
    payload.id ??
    payload.opportunity?.id ??
    payload.appointment?.id ??
    payload.messageId ??
    payload.message?.id ??
    payload.timestamp ??
    "";
  return `ghl:${eventType}:${id || Date.now()}`;
}

/** Human-readable label for an activity produced by a webhook. */
export function webhookSubject(eventType: string, payload: any = {}): string {
  const contact =
    payload.contact?.name ??
    [payload.first_name, payload.last_name].filter(Boolean).join(" ") ??
    payload.full_name ??
    "";
  const name = payload.opportunity?.name ?? payload.name ?? contact;
  return String(name || eventType);
}
