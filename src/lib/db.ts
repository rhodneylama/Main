import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SEED_PERSONAS } from "./seed-personas";
import { SCHEMA_SQL } from "./schema";
import type {
  CallRecord,
  CallType,
  Difficulty,
  Persona,
  ProductContext,
  RepStats,
  Scorecard,
  Turn,
} from "./types";

const DB_PATH =
  process.env.SALESFLOOR_DB_PATH ??
  process.env.TRAINER_DB_PATH ??
  path.join(process.cwd(), "data", "salesfloor.db");

let db: Database.Database | null = null;

export function connect(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(SCHEMA_SQL);

  seedPersonas(db);
  return db;
}

function seedPersonas(handle: Database.Database) {
  const insert = handle.prepare(`
    INSERT OR IGNORE INTO personas
      (id, name, title, company, industry, difficulty, mood, personality,
       objections, win_condition, call_types, voice_hint, built_in, created_at)
    VALUES
      (@id, @name, @title, @company, @industry, @difficulty, @mood, @personality,
       @objections, @winCondition, @callTypes, @voiceHint, 1, @createdAt)
  `);

  const now = new Date().toISOString();
  const seedAll = handle.transaction(() => {
    for (const p of SEED_PERSONAS) {
      insert.run({
        ...p,
        objections: JSON.stringify(p.objections),
        callTypes: JSON.stringify(p.callTypes),
        voiceHint: p.voiceHint ?? null,
        createdAt: now,
      });
    }
  });
  seedAll();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPersona(row: any): Persona {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    company: row.company,
    industry: row.industry,
    difficulty: row.difficulty as Difficulty,
    mood: row.mood,
    personality: row.personality,
    objections: JSON.parse(row.objections),
    winCondition: row.win_condition,
    callTypes: JSON.parse(row.call_types) as CallType[],
    voiceHint: row.voice_hint ?? undefined,
    builtIn: Boolean(row.built_in),
    createdAt: row.created_at,
  };
}

function rowToCall(row: any): CallRecord {
  return {
    id: row.id,
    repName: row.rep_name,
    personaId: row.persona_id,
    personaName: row.persona_name,
    callType: row.call_type as CallType,
    difficulty: row.difficulty as Difficulty,
    startedAt: row.started_at,
    durationSec: row.duration_sec,
    transcript: JSON.parse(row.transcript) as Turn[],
    scorecard: row.scorecard ? (JSON.parse(row.scorecard) as Scorecard) : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------------------------------------------------------------- personas */

export function listPersonas(): Persona[] {
  return connect()
    .prepare("SELECT * FROM personas ORDER BY difficulty ASC, name ASC")
    .all()
    .map(rowToPersona);
}

export function getPersona(id: string): Persona | null {
  const row = connect().prepare("SELECT * FROM personas WHERE id = ?").get(id);
  return row ? rowToPersona(row) : null;
}

export function upsertPersona(p: Persona): void {
  connect()
    .prepare(
      `INSERT INTO personas
         (id, name, title, company, industry, difficulty, mood, personality,
          objections, win_condition, call_types, voice_hint, built_in, created_at)
       VALUES
         (@id, @name, @title, @company, @industry, @difficulty, @mood, @personality,
          @objections, @winCondition, @callTypes, @voiceHint, @builtIn, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, title=excluded.title, company=excluded.company,
         industry=excluded.industry, difficulty=excluded.difficulty, mood=excluded.mood,
         personality=excluded.personality, objections=excluded.objections,
         win_condition=excluded.win_condition, call_types=excluded.call_types,
         voice_hint=excluded.voice_hint`,
    )
    .run({
      ...p,
      objections: JSON.stringify(p.objections),
      callTypes: JSON.stringify(p.callTypes),
      voiceHint: p.voiceHint ?? null,
      builtIn: p.builtIn ? 1 : 0,
    });
}

/** Built-in personas are protected so the seed set always stays available. */
export function deletePersona(id: string): boolean {
  const res = connect()
    .prepare("DELETE FROM personas WHERE id = ? AND built_in = 0")
    .run(id);
  return res.changes > 0;
}

/* ------------------------------------------------------------------- calls */

export function saveCall(call: CallRecord): void {
  connect()
    .prepare(
      `INSERT INTO calls
         (id, rep_name, persona_id, persona_name, call_type, difficulty,
          started_at, duration_sec, transcript, scorecard)
       VALUES
         (@id, @repName, @personaId, @personaName, @callType, @difficulty,
          @startedAt, @durationSec, @transcript, @scorecard)
       ON CONFLICT(id) DO UPDATE SET
         duration_sec=excluded.duration_sec,
         transcript=excluded.transcript,
         scorecard=excluded.scorecard`,
    )
    .run({
      ...call,
      transcript: JSON.stringify(call.transcript),
      scorecard: call.scorecard ? JSON.stringify(call.scorecard) : null,
    });
}

export function getCall(id: string): CallRecord | null {
  const row = connect().prepare("SELECT * FROM calls WHERE id = ?").get(id);
  return row ? rowToCall(row) : null;
}

export function listCalls(repName?: string, limit = 100): CallRecord[] {
  const handle = connect();
  const rows = repName
    ? handle
        .prepare("SELECT * FROM calls WHERE rep_name = ? ORDER BY started_at DESC LIMIT ?")
        .all(repName, limit)
    : handle.prepare("SELECT * FROM calls ORDER BY started_at DESC LIMIT ?").all(limit);
  return rows.map(rowToCall);
}

/**
 * Leaderboard data. Only scored calls count toward averages — an abandoned
 * call shouldn't drag a rep's number down.
 */
export function repStats(): RepStats[] {
  const rows = connect()
    .prepare(
      `SELECT rep_name, transcript, scorecard, started_at
         FROM calls
        ORDER BY started_at DESC`,
    )
    .all() as { rep_name: string; scorecard: string | null; started_at: string }[];

  const byRep = new Map<string, RepStats & { _scores: number[] }>();

  for (const row of rows) {
    let entry = byRep.get(row.rep_name);
    if (!entry) {
      entry = {
        repName: row.rep_name,
        calls: 0,
        avgScore: 0,
        bestScore: 0,
        meetingsBooked: 0,
        lastCallAt: row.started_at,
        _scores: [],
      };
      byRep.set(row.rep_name, entry);
    }

    entry.calls += 1;
    if (row.started_at > entry.lastCallAt) entry.lastCallAt = row.started_at;

    if (row.scorecard) {
      const sc = JSON.parse(row.scorecard) as Scorecard;
      entry._scores.push(sc.overall);
      entry.bestScore = Math.max(entry.bestScore, sc.overall);
      if (sc.meetingBooked) entry.meetingsBooked += 1;
    }
  }

  return [...byRep.values()]
    .map(({ _scores, ...rest }) => ({
      ...rest,
      avgScore: _scores.length
        ? Math.round(_scores.reduce((a, b) => a + b, 0) / _scores.length)
        : 0,
    }))
    .sort((a, b) => b.avgScore - a.avgScore || b.calls - a.calls);
}

/* ---------------------------------------------------------------- settings */

const DEFAULT_PRODUCT_CONTEXT: ProductContext = {
  product: "",
  icp: "",
  pitch: "",
  proofPoints: "",
  commonObjections: "",
};

export function getProductContext(): ProductContext {
  const row = connect()
    .prepare("SELECT value FROM settings WHERE key = 'product_context'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_PRODUCT_CONTEXT;
  return { ...DEFAULT_PRODUCT_CONTEXT, ...(JSON.parse(row.value) as ProductContext) };
}

export function setProductContext(ctx: ProductContext): void {
  connect()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('product_context', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(JSON.stringify(ctx));
}

/* ------------------------------------------------------- generic settings */

export function getSetting<T>(key: string, fallback: T): T {
  const row = connect()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  connect()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, JSON.stringify(value));
}
