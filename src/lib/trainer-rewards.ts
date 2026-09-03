import { trainingCallPoints } from "./points";
import { ensureRepByName, recordActivity, recordCelebration, syncBadges } from "./sales-db";
import type { CallRecord } from "./types";

/**
 * Puts a scored practice call on the leaderboard. Practice is worth points
 * because it is the one activity a rep controls entirely — but it pays on the
 * scorecard, so grinding through calls without improving earns very little.
 *
 * The call id is the activity's external id, so re-scoring never pays twice.
 */
export function awardPracticeCall(call: CallRecord): void {
  if (!call.scorecard || !call.repName.trim()) return;

  const rep = ensureRepByName(call.repName);
  const points = trainingCallPoints(call.scorecard.overall);

  const activity = recordActivity({
    repId: rep.id,
    type: "training_call",
    subject: `Practice call — ${call.personaName} (${call.scorecard.overall}/100)`,
    points,
    occurredAt: call.startedAt,
    source: "trainer",
    externalId: `trainer:call:${call.id}`,
  });

  if (!activity) return;

  if (call.scorecard.overall >= 90) {
    recordCelebration({
      repId: rep.id,
      kind: "training_ace",
      headline: `${rep.name} scored ${call.scorecard.overall} on a practice call`,
      detail: `Against ${call.personaName}`,
    });
  }

  syncBadges(rep.id);
}
