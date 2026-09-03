import { randomUUID } from "node:crypto";
import { connect, getSetting, setSetting } from "./db";
import { listReps, syncBadges } from "./sales-db";
import { dealWonPoints, pointsFor } from "./points";
import type { ActivityType, Deal, Pipeline } from "./types";

/**
 * Demo data so a fresh install has something on the screen. It is generated
 * once, on first run, and never touched again — connecting GoHighLevel adds
 * real data alongside it rather than replacing it.
 *
 * Set SALESFLOOR_SEED_DEMO=false to start with an empty floor instead.
 */

const SEED_FLAG = "demo_seeded";

/** Small deterministic PRNG, so the demo floor looks the same on every install. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const TEAMS = [
  { id: "team-north", name: "North", colorSlot: 1 },
  { id: "team-south", name: "South", colorSlot: 2 },
  { id: "team-enterprise", name: "Enterprise", colorSlot: 3 },
];

const REPS = [
  { name: "Maya Okonjo", avatar: "🦊", team: "team-north", quota: 4_000_000, skill: 1.25 },
  { name: "Dev Ramanathan", avatar: "🐙", team: "team-north", quota: 4_000_000, skill: 1.0 },
  { name: "Casey Lindqvist", avatar: "🐻", team: "team-north", quota: 3_500_000, skill: 0.75 },
  { name: "Toni Alvarez", avatar: "🦅", team: "team-south", quota: 4_000_000, skill: 1.15 },
  { name: "Priya Sundaram", avatar: "🐝", team: "team-south", quota: 3_500_000, skill: 0.95 },
  { name: "Marcus Bell", avatar: "🐺", team: "team-south", quota: 3_500_000, skill: 0.8 },
  { name: "Ines Duarte", avatar: "🦉", team: "team-enterprise", quota: 8_000_000, skill: 1.3 },
  { name: "Sam Whitfield", avatar: "🦁", team: "team-enterprise", quota: 8_000_000, skill: 1.05 },
];

const PIPELINE: Pipeline = {
  id: "pipeline-demo",
  name: "New Business",
  source: "seed",
  stages: [
    { id: "stage-new", name: "New Lead", order: 0 },
    { id: "stage-contacted", name: "Contacted", order: 1 },
    { id: "stage-qualified", name: "Qualified", order: 2 },
    { id: "stage-proposal", name: "Proposal", order: 3 },
    { id: "stage-negotiation", name: "Negotiation", order: 4 },
  ],
};

const COMPANIES = [
  "Northwind Logistics", "Fielder & Co", "Brightline Dental", "Vertex Roofing",
  "Copperfield Fitness", "Harbour Point Legal", "Silverline HVAC", "Tessera Studios",
  "Ridgeway Motors", "Blue Fern Wellness", "Kestrel Security", "Ardent Home Care",
  "Loomis Landscaping", "Pinnacle Orthodontics", "Redwood Plumbing", "Everly Interiors",
  "Cobalt Pest Control", "Marlow Insurance", "Thornbury Realty", "Juniper Med Spa",
];

const CONTACTS = [
  "Dana Whitmore", "Reuben Salas", "Kim Ferreira", "Otis Nakamura", "Leah Brennan",
  "Théo Marchand", "Ruth Oyelaran", "Andrei Popa", "Nina Castellanos", "Hal Yeung",
];

const MATERIALS = [
  {
    title: "The 30-second opener that survives a hang-up",
    description:
      "The permission-based opener we use on every cold dial, plus the three ways it goes wrong.",
    kind: "link" as const,
    category: "Cold calling",
    url: "https://example.com/playbook/opener",
    durationMin: 8,
    required: true,
    points: 20,
  },
  {
    title: "Objection handling: 'we already have someone'",
    description: "Recorded teardown of four real calls where the rep worked the incumbent objection.",
    kind: "video" as const,
    category: "Objection handling",
    url: "https://example.com/videos/incumbent-objection",
    durationMin: 22,
    required: true,
    points: 25,
  },
  {
    title: "Discovery question bank",
    description: "Forty questions sorted by what they actually uncover. Steal liberally.",
    kind: "link" as const,
    category: "Discovery",
    url: "https://example.com/playbook/discovery-questions",
    durationMin: 15,
    required: false,
    points: 15,
  },
  {
    title: "Pricing and discount guardrails",
    description: "What you can offer without approval, and what needs a manager on the call.",
    kind: "doc" as const,
    category: "Pricing",
    url: "https://example.com/docs/pricing-guardrails",
    durationMin: 10,
    required: true,
    points: 20,
  },
  {
    title: "Booking the meeting without begging",
    description: "Assumptive close patterns for the last 60 seconds of a discovery call.",
    kind: "video" as const,
    category: "Closing",
    url: "https://example.com/videos/assumptive-close",
    durationMin: 18,
    required: false,
    points: 15,
  },
];

export function isSeeded(): boolean {
  return getSetting<boolean>(SEED_FLAG, false);
}

/**
 * Generates the demo floor if it has not been generated before. Safe to call on
 * every request — it costs one settings lookup once the flag is set.
 */
export function ensureSeeded(): void {
  if (process.env.SALESFLOOR_SEED_DEMO === "false") return;
  if (isSeeded()) return;

  const handle = connect();
  const repCount = handle.prepare("SELECT COUNT(*) AS n FROM reps").get() as { n: number };
  if (repCount.n > 0) {
    setSetting(SEED_FLAG, true);
    return;
  }

  const rand = makeRandom(20260903);
  const now = new Date();
  const DAYS = 90;

  const insertTeam = handle.prepare(
    "INSERT OR IGNORE INTO teams (id, name, color_slot, created_at) VALUES (?, ?, ?, ?)",
  );
  const insertRep = handle.prepare(
    `INSERT INTO reps (id, name, email, team_id, avatar, role, quota_cents, ghl_user_id, active, created_at)
     VALUES (@id, @name, @email, @teamId, @avatar, @role, @quotaCents, NULL, 1, @createdAt)`,
  );
  const insertActivity = handle.prepare(
    `INSERT INTO activities
       (id, rep_id, type, subject, points, value_cents, occurred_at, source, external_id, deal_id)
     VALUES (@id, @repId, @type, @subject, @points, @valueCents, @occurredAt, 'seed', NULL, @dealId)`,
  );
  const insertDeal = handle.prepare(
    `INSERT INTO deals
       (id, name, contact_name, rep_id, pipeline_id, pipeline_name, stage_id, stage_name,
        stage_order, status, value_cents, source, external_id, created_at, updated_at, closed_at)
     VALUES
       (@id, @name, @contactName, @repId, @pipelineId, @pipelineName, @stageId, @stageName,
        @stageOrder, @status, @valueCents, 'seed', NULL, @createdAt, @updatedAt, @closedAt)`,
  );
  const insertCelebration = handle.prepare(
    `INSERT INTO celebrations (id, rep_id, kind, headline, detail, value_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMaterial = handle.prepare(
    `INSERT INTO materials
       (id, title, description, kind, category, url, file_path, file_name,
        size_bytes, duration_min, required, points, created_at)
     VALUES (@id, @title, @description, @kind, @category, @url, NULL, NULL, 0,
             @durationMin, @required, @points, @createdAt)`,
  );
  const insertCompetition = handle.prepare(
    `INSERT INTO competitions
       (id, name, description, metric, scope, starts_at, ends_at, target, prize, created_at)
     VALUES (@id, @name, @description, @metric, @scope, @startsAt, @endsAt, @target, @prize, @createdAt)`,
  );

  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const dayOffset = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, Math.floor(rand() * 60), 0, 0);
    return d.toISOString();
  };

  const seed = handle.transaction(() => {
    for (const team of TEAMS) {
      insertTeam.run(team.id, team.name, team.colorSlot, now.toISOString());
    }

    handle
      .prepare("INSERT OR IGNORE INTO pipelines (id, name, stages, source) VALUES (?, ?, ?, ?)")
      .run(PIPELINE.id, PIPELINE.name, JSON.stringify(PIPELINE.stages), "seed");

    const repIds: { id: string; name: string; skill: number }[] = [];

    for (const rep of REPS) {
      const id = randomUUID();
      repIds.push({ id, name: rep.name, skill: rep.skill });
      insertRep.run({
        id,
        name: rep.name,
        email: `${rep.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        teamId: rep.team,
        avatar: rep.avatar,
        role: "rep",
        quotaCents: rep.quota,
        createdAt: dayOffset(DAYS, 9),
      });
    }

    const activity = (
      repId: string,
      type: ActivityType,
      subject: string,
      occurredAt: string,
      valueCents = 0,
      dealId: string | null = null,
    ) =>
      insertActivity.run({
        id: randomUUID(),
        repId,
        type,
        subject,
        points: type === "deal_won" ? dealWonPoints(valueCents) : pointsFor(type),
        valueCents,
        occurredAt,
        dealId,
      });

    for (const rep of repIds) {
      for (let d = DAYS - 1; d >= 0; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);
        const weekday = date.getDay();
        if (weekday === 0 || weekday === 6) continue;

        // Effort ramps slightly toward the present, so the trend line has shape.
        const recency = 0.75 + (0.5 * (DAYS - d)) / DAYS;
        const dials = Math.round((12 + rand() * 28) * rep.skill * recency);

        for (let i = 0; i < dials; i++) {
          activity(rep.id, "call", `Dial — ${pick(COMPANIES)}`, dayOffset(d, 9 + Math.floor(rand() * 8)));
        }

        const conversations = Math.round(dials * (0.12 + rand() * 0.1));
        for (let i = 0; i < conversations; i++) {
          activity(
            rep.id,
            "conversation",
            `Connected — ${pick(COMPANIES)}`,
            dayOffset(d, 9 + Math.floor(rand() * 8)),
          );
        }

        const emails = Math.round(5 + rand() * 15);
        for (let i = 0; i < emails; i++) {
          activity(rep.id, "email", `Follow-up — ${pick(COMPANIES)}`, dayOffset(d, 8 + Math.floor(rand() * 9)));
        }

        if (rand() < 0.55 * rep.skill) {
          const company = pick(COMPANIES);
          activity(rep.id, "appointment_set", `Discovery booked — ${company}`, dayOffset(d, 10 + Math.floor(rand() * 6)));
          if (d < 7 && rand() < 0.3) {
            insertCelebration.run(
              randomUUID(),
              rep.id,
              "appointment_set",
              `${rep.name} booked a discovery call`,
              company,
              0,
              dayOffset(d, 11),
            );
          }
        }

        if (rand() < 0.35 * rep.skill) {
          activity(rep.id, "appointment_held", `Discovery held — ${pick(COMPANIES)}`, dayOffset(d, 11 + Math.floor(rand() * 5)));
        }

        if (rand() < 0.22 * rep.skill) {
          activity(rep.id, "proposal_sent", `Proposal — ${pick(COMPANIES)}`, dayOffset(d, 14 + Math.floor(rand() * 4)));
        }
      }
    }

    // Deals: a live pipeline plus the closed history behind the revenue numbers.
    const makeDeal = (repId: string, status: Deal["status"], daysAgo: number): Deal => {
      const stage = PIPELINE.stages[Math.floor(rand() * PIPELINE.stages.length)];
      const company = pick(COMPANIES);
      const created = dayOffset(Math.min(DAYS - 1, daysAgo + Math.floor(rand() * 30)), 10);
      const value = Math.round((2000 + rand() * 22000) * 100);
      return {
        id: randomUUID(),
        name: `${company} — ${pick(["retainer", "annual plan", "pilot", "expansion"])}`,
        contactName: pick(CONTACTS),
        repId,
        pipelineId: PIPELINE.id,
        pipelineName: PIPELINE.name,
        stageId: status === "open" ? stage.id : PIPELINE.stages[4].id,
        stageName: status === "open" ? stage.name : PIPELINE.stages[4].name,
        stageOrder: status === "open" ? stage.order : 4,
        status,
        valueCents: value,
        source: "seed",
        externalId: null,
        createdAt: created,
        updatedAt: dayOffset(daysAgo, 15),
        closedAt: status === "open" ? null : dayOffset(daysAgo, 15),
      };
    };

    for (const rep of repIds) {
      const openCount = Math.round(4 + rand() * 6 * rep.skill);
      for (let i = 0; i < openCount; i++) {
        insertDeal.run(makeDeal(rep.id, "open", Math.floor(rand() * 20)));
      }

      const wonCount = Math.round(3 + rand() * 7 * rep.skill);
      for (let i = 0; i < wonCount; i++) {
        const daysAgo = Math.floor(rand() * DAYS);
        const deal = makeDeal(rep.id, "won", daysAgo);
        insertDeal.run(deal);
        activity(rep.id, "deal_won", deal.name, deal.closedAt!, deal.valueCents, deal.id);
        if (daysAgo < 6) {
          insertCelebration.run(
            randomUUID(),
            rep.id,
            "deal_won",
            `${rep.name} closed ${deal.contactName}`,
            deal.name,
            deal.valueCents,
            deal.closedAt!,
          );
        }
      }

      const lostCount = Math.round(1 + rand() * 4);
      for (let i = 0; i < lostCount; i++) {
        const deal = makeDeal(rep.id, "lost", Math.floor(rand() * DAYS));
        insertDeal.run(deal);
        activity(rep.id, "deal_lost", deal.name, deal.closedAt!, 0, deal.id);
      }
    }

    for (const m of MATERIALS) {
      insertMaterial.run({
        id: randomUUID(),
        ...m,
        required: m.required ? 1 : 0,
        createdAt: dayOffset(Math.floor(rand() * 60), 12),
      });
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    insertCompetition.run({
      id: randomUUID(),
      name: "Month-end Sprint",
      description: "Most revenue closed before the month is out. Ties broken by deal count.",
      metric: "revenue",
      scope: "rep",
      startsAt: monthStart,
      endsAt: monthEnd,
      target: 2_500_000,
      prize: "Friday off + the good parking space",
      createdAt: monthStart,
    });

    insertCompetition.run({
      id: randomUUID(),
      name: "Dial Derby",
      description: "Team with the most logged activity this week takes it.",
      metric: "activities",
      scope: "team",
      startsAt: dayOffset(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1, 0),
      endsAt: dayOffset(-6, 23),
      target: 1500,
      prize: "Lunch on the house",
      createdAt: dayOffset(7, 9),
    });
  });

  seed();

  // Badges are evaluated from the finished counters, so this runs after the
  // insert transaction rather than inside it.
  for (const rep of listReps()) syncBadges(rep.id, { silent: true });

  setSetting(SEED_FLAG, true);
}
