import { fetchOpportunities, fetchPipelines, fetchUsers } from "./client";
import { getGhlConfig, isGhlConfigured, setGhlConfig } from "./config";
import { toDeal, toPipeline, toRepFields, webhookActivityType, webhookExternalId, webhookSubject } from "./map";
import {
  getDealByExternalId,
  getRepByGhlUserId,
  getRepByName,
  listPipelines,
  recordActivity,
  recordCelebration,
  syncBadges,
  upsertDeal,
  upsertPipeline,
  upsertRep,
} from "../sales-db";
import type { GhlSyncResult, Pipeline } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Pulls pipelines, users and opportunities from GoHighLevel into the local
 * tables. Everything is upserted by external id, so a sync can be re-run as
 * often as you like without duplicating anything.
 *
 * Won and lost opportunities also produce a scoring activity — that is what
 * puts GHL revenue on the leaderboard — and each one is written with the
 * opportunity's id as its external id, so re-syncing never pays out twice.
 */
export async function syncFromGhl(): Promise<GhlSyncResult> {
  const config = getGhlConfig();
  if (!isGhlConfigured(config)) {
    return {
      ok: false,
      pipelines: 0,
      deals: 0,
      reps: 0,
      activities: 0,
      message: "GoHighLevel is not connected. Add a token and location id in Settings.",
    };
  }

  try {
    const [pipelineData, userData] = await Promise.all([
      fetchPipelines(config.locationId),
      fetchUsers(config.locationId).catch(() => ({ users: [] })),
    ]);

    const pipelines: Pipeline[] = (pipelineData.pipelines ?? [])
      .map(toPipeline)
      .filter((p): p is Pipeline => p !== null);
    for (const pipeline of pipelines) upsertPipeline(pipeline);

    // Reps already on the floor are matched by GHL id first, then by name, so
    // connecting GHL links up existing reps instead of duplicating them.
    let repCount = 0;
    const repIdByGhlUser = new Map<string, string>();
    for (const raw of userData.users ?? []) {
      const fields = toRepFields(raw);
      if (!fields) continue;
      const existing =
        getRepByGhlUserId(fields.ghlUserId) ?? getRepByName(fields.name) ?? null;
      const rep = upsertRep({
        id: existing?.id,
        name: fields.name,
        email: fields.email || existing?.email,
        ghlUserId: fields.ghlUserId,
      });
      repIdByGhlUser.set(fields.ghlUserId, rep.id);
      repCount++;
    }

    const pipelineMap = new Map(
      [...listPipelines(), ...pipelines].map((p) => [p.id, p] as const),
    );

    const opportunities = await fetchOpportunities(config.locationId);

    let dealCount = 0;
    let activityCount = 0;

    for (const raw of opportunities) {
      const deal = toDeal(raw, { pipelines: pipelineMap, repIdByGhlUser });
      if (!deal) continue;

      const previous = deal.externalId ? getDealByExternalId(deal.externalId) : null;
      if (previous) deal.id = previous.id;
      upsertDeal(deal);
      dealCount++;

      if (deal.repId && (deal.status === "won" || deal.status === "lost")) {
        const recorded = recordActivity({
          repId: deal.repId,
          type: deal.status === "won" ? "deal_won" : "deal_lost",
          subject: deal.name,
          valueCents: deal.status === "won" ? deal.valueCents : 0,
          occurredAt: deal.closedAt ?? deal.updatedAt,
          source: "ghl",
          externalId: `ghl:opportunity:${deal.externalId}:${deal.status}`,
          dealId: deal.id,
        });
        if (recorded) {
          activityCount++;
          syncBadges(deal.repId);
        }
      }
    }

    const message = `Synced ${pipelines.length} pipelines, ${repCount} users and ${dealCount} opportunities.`;
    setGhlConfig({ lastSyncAt: new Date().toISOString(), lastSyncStatus: message });

    return {
      ok: true,
      pipelines: pipelines.length,
      deals: dealCount,
      reps: repCount,
      activities: activityCount,
      message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    setGhlConfig({ lastSyncAt: new Date().toISOString(), lastSyncStatus: `Failed: ${message}` });
    return { ok: false, pipelines: 0, deals: 0, reps: 0, activities: 0, message };
  }
}

export interface WebhookOutcome {
  handled: boolean;
  reason: string;
}

/**
 * Turns a single GoHighLevel webhook into an activity, and raises a
 * celebration for the events the floor should see land in real time.
 */
export function handleGhlWebhook(payload: any): WebhookOutcome {
  const eventType = String(payload?.type ?? payload?.event ?? "");
  if (!eventType) return { handled: false, reason: "No event type on payload" };

  const type = webhookActivityType(eventType, payload);
  if (!type) return { handled: false, reason: `No activity mapped for ${eventType}` };

  const ghlUserId = String(
    payload.userId ?? payload.assignedTo ?? payload.opportunity?.assignedTo ?? "",
  );
  const rep = ghlUserId ? getRepByGhlUserId(ghlUserId) : null;
  if (!rep) {
    return {
      handled: false,
      reason: ghlUserId
        ? `No rep linked to GoHighLevel user ${ghlUserId}`
        : "Event has no assigned user",
    };
  }

  const valueCents =
    type === "deal_won"
      ? Math.round(Number(payload.opportunity?.monetaryValue ?? payload.monetaryValue ?? 0) * 100)
      : 0;

  const subject = webhookSubject(eventType, payload);
  const activity = recordActivity({
    repId: rep.id,
    type,
    subject,
    valueCents,
    source: "ghl",
    externalId: webhookExternalId(eventType, payload),
  });

  if (!activity) return { handled: false, reason: "Duplicate event, already recorded" };

  if (type === "deal_won") {
    recordCelebration({
      repId: rep.id,
      kind: "deal_won",
      headline: `${rep.name} closed a deal`,
      detail: subject,
      valueCents,
    });
  } else if (type === "appointment_set") {
    recordCelebration({
      repId: rep.id,
      kind: "appointment_set",
      headline: `${rep.name} booked an appointment`,
      detail: subject,
    });
  }

  syncBadges(rep.id);
  return { handled: true, reason: `Recorded ${type} for ${rep.name}` };
}
