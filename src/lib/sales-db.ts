import { randomUUID } from "node:crypto";
import { connect } from "./db";
import { BADGES_BY_KEY, earnedBadges, levelFor, pointsFor } from "./points";
import type {
  Activity,
  ActivityType,
  AwardedBadge,
  Celebration,
  CelebrationKind,
  Competition,
  CompetitionStanding,
  Deal,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPeriod,
  Pipeline,
  Rep,
  StageBreakdown,
  Team,
  TrendPoint,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------- rows */

function rowToTeam(row: any): Team {
  return {
    id: row.id,
    name: row.name,
    colorSlot: row.color_slot,
    createdAt: row.created_at,
  };
}

function rowToRep(row: any): Rep {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    teamId: row.team_id ?? null,
    avatar: row.avatar,
    role: row.role,
    quotaCents: row.quota_cents,
    ghlUserId: row.ghl_user_id ?? null,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function rowToDeal(row: any): Deal {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    repId: row.rep_id ?? null,
    pipelineId: row.pipeline_id,
    pipelineName: row.pipeline_name,
    stageId: row.stage_id,
    stageName: row.stage_name,
    stageOrder: row.stage_order,
    status: row.status,
    valueCents: row.value_cents,
    source: row.source,
    externalId: row.external_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at ?? null,
  };
}

function rowToActivity(row: any): Activity {
  return {
    id: row.id,
    repId: row.rep_id,
    type: row.type,
    subject: row.subject,
    points: row.points,
    valueCents: row.value_cents,
    occurredAt: row.occurred_at,
    source: row.source,
    externalId: row.external_id ?? null,
    dealId: row.deal_id ?? null,
  };
}

/* ------------------------------------------------------------------ teams */

export function listTeams(): Team[] {
  return connect().prepare("SELECT * FROM teams ORDER BY name").all().map(rowToTeam);
}

export function upsertTeam(team: Omit<Team, "createdAt"> & { createdAt?: string }): Team {
  const record: Team = { ...team, createdAt: team.createdAt ?? new Date().toISOString() };
  connect()
    .prepare(
      `INSERT INTO teams (id, name, color_slot, created_at)
       VALUES (@id, @name, @colorSlot, @createdAt)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, color_slot = excluded.color_slot`,
    )
    .run(record);
  return record;
}

export function deleteTeam(id: string): boolean {
  const handle = connect();
  const remove = handle.transaction(() => {
    handle.prepare("UPDATE reps SET team_id = NULL WHERE team_id = ?").run(id);
    return handle.prepare("DELETE FROM teams WHERE id = ?").run(id).changes > 0;
  });
  return remove();
}

/* ------------------------------------------------------------------- reps */

export function listReps(includeInactive = false): Rep[] {
  const sql = includeInactive
    ? "SELECT * FROM reps ORDER BY name"
    : "SELECT * FROM reps WHERE active = 1 ORDER BY name";
  return connect().prepare(sql).all().map(rowToRep);
}

export function getRep(id: string): Rep | null {
  const row = connect().prepare("SELECT * FROM reps WHERE id = ?").get(id);
  return row ? rowToRep(row) : null;
}

export function getRepByName(name: string): Rep | null {
  const row = connect()
    .prepare("SELECT * FROM reps WHERE lower(name) = lower(?) LIMIT 1")
    .get(name);
  return row ? rowToRep(row) : null;
}

export function getRepByGhlUserId(ghlUserId: string): Rep | null {
  const row = connect().prepare("SELECT * FROM reps WHERE ghl_user_id = ?").get(ghlUserId);
  return row ? rowToRep(row) : null;
}

export function upsertRep(rep: Partial<Rep> & { name: string }): Rep {
  const existing = rep.id ? getRep(rep.id) : null;
  const record: Rep = {
    id: rep.id ?? randomUUID(),
    name: rep.name,
    email: rep.email ?? existing?.email ?? "",
    teamId: rep.teamId ?? existing?.teamId ?? null,
    avatar: rep.avatar ?? existing?.avatar ?? "🙂",
    role: rep.role ?? existing?.role ?? "rep",
    quotaCents: rep.quotaCents ?? existing?.quotaCents ?? 0,
    ghlUserId: rep.ghlUserId ?? existing?.ghlUserId ?? null,
    active: rep.active ?? existing?.active ?? true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  connect()
    .prepare(
      `INSERT INTO reps
         (id, name, email, team_id, avatar, role, quota_cents, ghl_user_id, active, created_at)
       VALUES
         (@id, @name, @email, @teamId, @avatar, @role, @quotaCents, @ghlUserId, @active, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, email = excluded.email, team_id = excluded.team_id,
         avatar = excluded.avatar, role = excluded.role, quota_cents = excluded.quota_cents,
         ghl_user_id = excluded.ghl_user_id, active = excluded.active`,
    )
    .run({ ...record, active: record.active ? 1 : 0 });
  return record;
}

/**
 * Reps are deactivated rather than deleted — their activity stays in the
 * history so past leaderboards and competition results still add up.
 */
export function deactivateRep(id: string): boolean {
  return connect().prepare("UPDATE reps SET active = 0 WHERE id = ?").run(id).changes > 0;
}

/**
 * Finds the rep with this name, creating one if there isn't a match. The
 * practice screen asks reps to type their name, so this keeps trainer results
 * attached to a real rep record without forcing anyone to register first.
 */
export function ensureRepByName(name: string): Rep {
  const trimmed = name.trim();
  return getRepByName(trimmed) ?? upsertRep({ name: trimmed });
}

/* -------------------------------------------------------------- pipelines */

export function listPipelines(): Pipeline[] {
  return connect()
    .prepare("SELECT * FROM pipelines ORDER BY name")
    .all()
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      stages: JSON.parse(row.stages),
      source: row.source,
    }));
}

export function upsertPipeline(pipeline: Pipeline): void {
  connect()
    .prepare(
      `INSERT INTO pipelines (id, name, stages, source)
       VALUES (@id, @name, @stages, @source)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, stages = excluded.stages, source = excluded.source`,
    )
    .run({ ...pipeline, stages: JSON.stringify(pipeline.stages) });
}

/* ------------------------------------------------------------------ deals */

export function listDeals(filter: { repId?: string; status?: string; limit?: number } = {}): Deal[] {
  const clauses: string[] = [];
  const params: any[] = [];
  if (filter.repId) {
    clauses.push("rep_id = ?");
    params.push(filter.repId);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(filter.limit ?? 200);
  return connect()
    .prepare(`SELECT * FROM deals ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params)
    .map(rowToDeal);
}

export function getDealByExternalId(externalId: string): Deal | null {
  const row = connect().prepare("SELECT * FROM deals WHERE external_id = ?").get(externalId);
  return row ? rowToDeal(row) : null;
}

export function upsertDeal(deal: Deal): void {
  connect()
    .prepare(
      `INSERT INTO deals
         (id, name, contact_name, rep_id, pipeline_id, pipeline_name, stage_id, stage_name,
          stage_order, status, value_cents, source, external_id, created_at, updated_at, closed_at)
       VALUES
         (@id, @name, @contactName, @repId, @pipelineId, @pipelineName, @stageId, @stageName,
          @stageOrder, @status, @valueCents, @source, @externalId, @createdAt, @updatedAt, @closedAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, contact_name = excluded.contact_name, rep_id = excluded.rep_id,
         pipeline_id = excluded.pipeline_id, pipeline_name = excluded.pipeline_name,
         stage_id = excluded.stage_id, stage_name = excluded.stage_name,
         stage_order = excluded.stage_order, status = excluded.status,
         value_cents = excluded.value_cents, updated_at = excluded.updated_at,
         closed_at = excluded.closed_at`,
    )
    .run(deal);
}

/** Open deals grouped by stage, ordered as they sit in the pipeline. */
export function stageBreakdown(): StageBreakdown[] {
  const rows = connect()
    .prepare(
      `SELECT stage_name, MIN(stage_order) AS stage_order,
              COUNT(*) AS deals, SUM(value_cents) AS value_cents
         FROM deals
        WHERE status = 'open'
        GROUP BY stage_name
        ORDER BY stage_order ASC`,
    )
    .all() as any[];
  return rows.map((row) => ({
    stageName: row.stage_name,
    order: row.stage_order,
    deals: row.deals,
    valueCents: row.value_cents ?? 0,
  }));
}

/* ------------------------------------------------------------- activities */

export function listActivities(
  filter: { repId?: string; since?: string; limit?: number } = {},
): Activity[] {
  const clauses: string[] = [];
  const params: any[] = [];
  if (filter.repId) {
    clauses.push("rep_id = ?");
    params.push(filter.repId);
  }
  if (filter.since) {
    clauses.push("occurred_at >= ?");
    params.push(filter.since);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(filter.limit ?? 100);
  return connect()
    .prepare(`SELECT * FROM activities ${where} ORDER BY occurred_at DESC LIMIT ?`)
    .all(...params)
    .map(rowToActivity);
}

export interface NewActivity {
  repId: string;
  type: ActivityType;
  subject?: string;
  valueCents?: number;
  occurredAt?: string;
  source?: Activity["source"];
  externalId?: string | null;
  dealId?: string | null;
  /** Overrides the rule-based points, used by the trainer's score-based payout. */
  points?: number;
}

/**
 * Records an activity and awards its points. Returns null when the activity was
 * already recorded — GHL can deliver the same event more than once, and a
 * replayed webhook must not pay out twice.
 */
export function recordActivity(input: NewActivity): Activity | null {
  const activity: Activity = {
    id: randomUUID(),
    repId: input.repId,
    type: input.type,
    subject: input.subject ?? "",
    points: input.points ?? pointsFor(input.type, input.valueCents ?? 0),
    valueCents: input.valueCents ?? 0,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    source: input.source ?? "manual",
    externalId: input.externalId ?? null,
    dealId: input.dealId ?? null,
  };

  const res = connect()
    .prepare(
      `INSERT OR IGNORE INTO activities
         (id, rep_id, type, subject, points, value_cents, occurred_at, source, external_id, deal_id)
       VALUES
         (@id, @repId, @type, @subject, @points, @valueCents, @occurredAt, @source, @externalId, @dealId)`,
    )
    .run(activity);

  return res.changes > 0 ? activity : null;
}

export function deleteActivity(id: string): boolean {
  return connect().prepare("DELETE FROM activities WHERE id = ?").run(id).changes > 0;
}

/* ------------------------------------------------------------ time ranges */

/** Inclusive lower bound for a leaderboard period, as an ISO timestamp. */
export function periodStart(period: LeaderboardPeriod, now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      break;
    case "week": {
      // Weeks run Monday to Sunday, which is how sales weeks are counted.
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      break;
    }
    case "month":
      d.setDate(1);
      break;
    case "quarter":
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
      break;
    case "all":
      return "1970-01-01T00:00:00.000Z";
  }
  return d.toISOString();
}

/* ------------------------------------------------------------ leaderboard */

interface Totals {
  points: number;
  revenueCents: number;
  deals: number;
  activities: number;
}

function emptyTotals(): Totals {
  return { points: 0, revenueCents: 0, deals: 0, activities: 0 };
}

function metricValue(totals: Totals, metric: LeaderboardMetric): number {
  switch (metric) {
    case "points":
      return totals.points;
    case "revenue":
      return totals.revenueCents;
    case "deals":
      return totals.deals;
    case "activities":
      return totals.activities;
  }
}

/** Per-rep totals over a window. Revenue and deal counts come from won deals. */
function totalsByRep(since: string, until?: string): Map<string, Totals> {
  const params: any[] = [since];
  let bound = "";
  if (until) {
    bound = " AND occurred_at < ?";
    params.push(until);
  }

  const rows = connect()
    .prepare(
      `SELECT rep_id,
              SUM(points) AS points,
              COUNT(*) AS activities,
              SUM(CASE WHEN type = 'deal_won' THEN value_cents ELSE 0 END) AS revenue_cents,
              SUM(CASE WHEN type = 'deal_won' THEN 1 ELSE 0 END) AS deals
         FROM activities
        WHERE occurred_at >= ?${bound}
        GROUP BY rep_id`,
    )
    .all(...params) as any[];

  const map = new Map<string, Totals>();
  for (const row of rows) {
    map.set(row.rep_id, {
      points: row.points ?? 0,
      revenueCents: row.revenue_cents ?? 0,
      deals: row.deals ?? 0,
      activities: row.activities ?? 0,
    });
  }
  return map;
}

export function lifetimePoints(repId: string): number {
  const row = connect()
    .prepare("SELECT SUM(points) AS points FROM activities WHERE rep_id = ?")
    .get(repId) as { points: number | null };
  return row?.points ?? 0;
}

export function listBadges(repId: string): AwardedBadge[] {
  const rows = connect()
    .prepare("SELECT badge_key, awarded_at FROM rep_badges WHERE rep_id = ? ORDER BY awarded_at")
    .all(repId) as any[];
  return rows
    .filter((row) => BADGES_BY_KEY[row.badge_key])
    .map((row) => ({ ...BADGES_BY_KEY[row.badge_key], awardedAt: row.awarded_at }));
}

export function leaderboard(
  period: LeaderboardPeriod,
  metric: LeaderboardMetric,
  scope: "rep" | "team" = "rep",
): LeaderboardEntry[] {
  const since = periodStart(period);
  const totals = totalsByRep(since);
  const teams = new Map(listTeams().map((t) => [t.id, t]));
  const reps = listReps();

  if (scope === "team") {
    const byTeam = new Map<string, Totals>();
    for (const rep of reps) {
      if (!rep.teamId) continue;
      const t = totals.get(rep.id);
      if (!t) continue;
      const acc = byTeam.get(rep.teamId) ?? emptyTotals();
      acc.points += t.points;
      acc.revenueCents += t.revenueCents;
      acc.deals += t.deals;
      acc.activities += t.activities;
      byTeam.set(rep.teamId, acc);
    }

    return [...teams.values()]
      .map((team) => {
        const t = byTeam.get(team.id) ?? emptyTotals();
        return {
          rank: 0,
          id: team.id,
          name: team.name,
          avatar: "🏢",
          teamId: team.id,
          teamName: team.name,
          colorSlot: team.colorSlot,
          ...t,
          value: metricValue(t, metric),
          level: levelFor(t.points),
          badges: [],
        };
      })
      .sort((a, b) => b.value - a.value)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }

  return reps
    .map((rep) => {
      const t = totals.get(rep.id) ?? emptyTotals();
      const team = rep.teamId ? teams.get(rep.teamId) : undefined;
      return {
        rank: 0,
        id: rep.id,
        name: rep.name,
        avatar: rep.avatar,
        teamId: rep.teamId,
        teamName: team?.name ?? null,
        colorSlot: team?.colorSlot ?? 1,
        ...t,
        value: metricValue(t, metric),
        level: levelFor(lifetimePoints(rep.id)),
        badges: listBadges(rep.id),
      };
    })
    .sort((a, b) => b.value - a.value || b.points - a.points)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

/* ------------------------------------------------------------- dashboard  */

export function trend(days: number): TrendPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = connect()
    .prepare(
      `SELECT substr(occurred_at, 1, 10) AS date,
              COUNT(*) AS activities,
              SUM(points) AS points,
              SUM(CASE WHEN type = 'deal_won' THEN value_cents ELSE 0 END) AS revenue_cents
         FROM activities
        WHERE occurred_at >= ?
        GROUP BY date`,
    )
    .all(start.toISOString()) as any[];

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    out.push({
      date: key,
      activities: row?.activities ?? 0,
      revenueCents: row?.revenue_cents ?? 0,
      points: row?.points ?? 0,
    });
  }
  return out;
}

export interface PeriodSummary {
  wonRevenueCents: number;
  wonDeals: number;
  lostDeals: number;
  openPipelineCents: number;
  openDeals: number;
  activitiesToday: number;
  appointmentsSet: number;
}

export function periodSummary(period: LeaderboardPeriod): PeriodSummary {
  const handle = connect();
  const since = periodStart(period);

  const won = handle
    .prepare(
      `SELECT COUNT(*) AS deals, SUM(value_cents) AS revenue
         FROM activities WHERE type = 'deal_won' AND occurred_at >= ?`,
    )
    .get(since) as any;

  const lost = handle
    .prepare(
      `SELECT COUNT(*) AS deals FROM activities WHERE type = 'deal_lost' AND occurred_at >= ?`,
    )
    .get(since) as any;

  const open = handle
    .prepare(
      `SELECT COUNT(*) AS deals, SUM(value_cents) AS value FROM deals WHERE status = 'open'`,
    )
    .get() as any;

  const today = handle
    .prepare(`SELECT COUNT(*) AS n FROM activities WHERE occurred_at >= ?`)
    .get(periodStart("today")) as any;

  const appointments = handle
    .prepare(
      `SELECT COUNT(*) AS n FROM activities
        WHERE type IN ('appointment_set', 'appointment_held') AND occurred_at >= ?`,
    )
    .get(since) as any;

  return {
    wonRevenueCents: won?.revenue ?? 0,
    wonDeals: won?.deals ?? 0,
    lostDeals: lost?.deals ?? 0,
    openPipelineCents: open?.value ?? 0,
    openDeals: open?.deals ?? 0,
    activitiesToday: today?.n ?? 0,
    appointmentsSet: appointments?.n ?? 0,
  };
}

/* ----------------------------------------------------------- competitions */

export function listCompetitions(): Competition[] {
  return connect()
    .prepare("SELECT * FROM competitions ORDER BY starts_at DESC")
    .all()
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      metric: row.metric,
      scope: row.scope,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      target: row.target,
      prize: row.prize,
      createdAt: row.created_at,
    }));
}

export function getCompetition(id: string): Competition | null {
  return listCompetitions().find((c) => c.id === id) ?? null;
}

export function upsertCompetition(c: Competition): void {
  connect()
    .prepare(
      `INSERT INTO competitions
         (id, name, description, metric, scope, starts_at, ends_at, target, prize, created_at)
       VALUES
         (@id, @name, @description, @metric, @scope, @startsAt, @endsAt, @target, @prize, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description, metric = excluded.metric,
         scope = excluded.scope, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
         target = excluded.target, prize = excluded.prize`,
    )
    .run(c);
}

export function deleteCompetition(id: string): boolean {
  return connect().prepare("DELETE FROM competitions WHERE id = ?").run(id).changes > 0;
}

export function competitionStatus(c: Competition, now = new Date()): "upcoming" | "live" | "ended" {
  const t = now.toISOString();
  if (t < c.startsAt) return "upcoming";
  if (t > c.endsAt) return "ended";
  return "live";
}

/** Standings are scored over the competition's own window, not the current period. */
export function competitionStandings(c: Competition): CompetitionStanding[] {
  const totals = totalsByRep(c.startsAt, c.endsAt);
  const reps = listReps(true);
  const teams = listTeams();

  const rows: Omit<CompetitionStanding, "rank" | "progress">[] =
    c.scope === "team"
      ? teams.map((team) => {
          const acc = emptyTotals();
          for (const rep of reps.filter((r) => r.teamId === team.id)) {
            const t = totals.get(rep.id);
            if (!t) continue;
            acc.points += t.points;
            acc.revenueCents += t.revenueCents;
            acc.deals += t.deals;
            acc.activities += t.activities;
          }
          return {
            id: team.id,
            name: team.name,
            avatar: "🏢",
            colorSlot: team.colorSlot,
            value: metricValue(acc, c.metric),
          };
        })
      : reps.map((rep) => ({
          id: rep.id,
          name: rep.name,
          avatar: rep.avatar,
          colorSlot: 1,
          value: metricValue(totals.get(rep.id) ?? emptyTotals(), c.metric),
        }));

  return rows
    .sort((a, b) => b.value - a.value)
    .map((row, i) => ({
      ...row,
      rank: i + 1,
      progress: c.target > 0 ? Math.min(1, row.value / c.target) : 0,
    }));
}

/* ----------------------------------------------------------- celebrations */

export function recordCelebration(input: {
  repId: string;
  kind: CelebrationKind;
  headline: string;
  detail?: string;
  valueCents?: number;
  createdAt?: string;
}): void {
  connect()
    .prepare(
      `INSERT INTO celebrations (id, rep_id, kind, headline, detail, value_cents, created_at)
       VALUES (@id, @repId, @kind, @headline, @detail, @valueCents, @createdAt)`,
    )
    .run({
      id: randomUUID(),
      repId: input.repId,
      kind: input.kind,
      headline: input.headline,
      detail: input.detail ?? "",
      valueCents: input.valueCents ?? 0,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
}

export function listCelebrations(limit = 20): Celebration[] {
  const rows = connect()
    .prepare(
      `SELECT c.*, r.name AS rep_name, r.avatar, r.team_id
         FROM celebrations c
         LEFT JOIN reps r ON r.id = c.rep_id
        ORDER BY c.created_at DESC
        LIMIT ?`,
    )
    .all(limit) as any[];

  const teams = new Map(listTeams().map((t) => [t.id, t]));
  return rows.map((row) => ({
    id: row.id,
    repId: row.rep_id,
    repName: row.rep_name ?? "Someone",
    avatar: row.avatar ?? "🎉",
    colorSlot: row.team_id ? (teams.get(row.team_id)?.colorSlot ?? 1) : 1,
    kind: row.kind,
    headline: row.headline,
    detail: row.detail,
    valueCents: row.value_cents,
    createdAt: row.created_at,
  }));
}

/* ----------------------------------------------------------------- badges */

/**
 * Re-evaluates a rep's badges and awards any newly earned ones. Called after
 * anything that could move a counter; awarding is idempotent, and each new
 * badge raises a celebration so the floor sees it.
 *
 * `silent` suppresses those celebrations — used when backfilling badges over
 * history that already happened, where a burst of "just earned" notices would
 * drown out the actual news.
 */
export function syncBadges(repId: string, opts: { silent?: boolean } = {}): string[] {
  const handle = connect();
  const rep = getRep(repId);
  if (!rep) return [];

  const counts = handle
    .prepare(
      `SELECT
         SUM(CASE WHEN type = 'deal_won' THEN 1 ELSE 0 END) AS deals_won,
         SUM(CASE WHEN type = 'call' THEN 1 ELSE 0 END) AS dials,
         SUM(CASE WHEN type = 'appointment_set' THEN 1 ELSE 0 END) AS appointments,
         SUM(CASE WHEN type = 'material_completed' THEN 1 ELSE 0 END) AS materials,
         MAX(CASE WHEN type = 'deal_won' THEN value_cents ELSE 0 END) AS largest
       FROM activities WHERE rep_id = ?`,
    )
    .get(repId) as any;

  const monthRevenue = handle
    .prepare(
      `SELECT SUM(value_cents) AS revenue FROM activities
        WHERE rep_id = ? AND type = 'deal_won' AND occurred_at >= ?`,
    )
    .get(repId, periodStart("month")) as any;

  const bestPractice = handle
    .prepare(
      `SELECT scorecard FROM calls WHERE lower(rep_name) = lower(?) AND scorecard IS NOT NULL`,
    )
    .all(rep.name) as any[];
  const bestScore = bestPractice.reduce((best, row) => {
    try {
      return Math.max(best, JSON.parse(row.scorecard).overall ?? 0);
    } catch {
      return best;
    }
  }, 0);

  const earned = earnedBadges({
    dealsWon: counts?.deals_won ?? 0,
    dials: counts?.dials ?? 0,
    appointmentsSet: counts?.appointments ?? 0,
    largestDealCents: counts?.largest ?? 0,
    materialsCompleted: counts?.materials ?? 0,
    bestPracticeScore: bestScore,
    quotaAttainment: rep.quotaCents > 0 ? (monthRevenue?.revenue ?? 0) / rep.quotaCents : 0,
  });

  const existing = new Set(
    (handle.prepare("SELECT badge_key FROM rep_badges WHERE rep_id = ?").all(repId) as any[]).map(
      (r) => r.badge_key,
    ),
  );

  const insert = handle.prepare(
    "INSERT OR IGNORE INTO rep_badges (rep_id, badge_key, awarded_at) VALUES (?, ?, ?)",
  );
  const now = new Date().toISOString();
  const fresh: string[] = [];

  for (const key of earned) {
    if (existing.has(key)) continue;
    insert.run(repId, key, now);
    fresh.push(key);
    const badge = BADGES_BY_KEY[key];
    if (badge && !opts.silent) {
      recordCelebration({
        repId,
        kind: "badge",
        headline: `${rep.name} earned ${badge.name}`,
        detail: badge.description,
      });
    }
  }
  return fresh;
}
