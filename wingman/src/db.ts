import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Call, CallStatus, Utterance, WingmanEvent } from "./types.js";
import type { CallSession } from "./loop/session.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      prospect_company TEXT,
      prospect_website TEXT,
      rep_names TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      recall_bot_id TEXT,
      summary TEXT,
      recap_email_draft TEXT,
      final_state TEXT
    );
    CREATE TABLE IF NOT EXISTS utterances (
      call_id TEXT NOT NULL REFERENCES calls(id),
      seq INTEGER NOT NULL,
      speaker TEXT NOT NULL,
      is_rep INTEGER NOT NULL,
      text TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      PRIMARY KEY (call_id, seq)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT NOT NULL REFERENCES calls(id),
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_by_call ON events(call_id, id);
  `);
  return db;
}

export function insertCall(call: Call): void {
  getDb()
    .prepare(
      `INSERT INTO calls (id, source, status, origin, prospect_company, prospect_website, rep_names, started_at, ended_at, recall_bot_id, summary, recap_email_draft)
       VALUES (@id, @source, @status, @origin, @prospectCompany, @prospectWebsite, @repNames, @startedAt, @endedAt, @recallBotId, @summary, @recapEmailDraft)`,
    )
    .run({ ...call, repNames: JSON.stringify(call.repNames) });
}

export function finishCall(id: string, status: CallStatus, finalState: unknown): void {
  getDb()
    .prepare(`UPDATE calls SET status = ?, ended_at = ?, final_state = ? WHERE id = ?`)
    .run(status, Date.now(), JSON.stringify(finalState), id);
}

/** Store every utterance and event a session emits. */
export function recordSession(session: CallSession): void {
  const d = getDb();
  const insertUtterance = d.prepare(
    `INSERT INTO utterances (call_id, seq, speaker, is_rep, text, at_ms) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertEvent = d.prepare(`INSERT INTO events (call_id, type, payload, created_at) VALUES (?, ?, ?, ?)`);
  session.on("event", (event: WingmanEvent) => {
    if (event.type === "utterance") {
      const u: Utterance = event.utterance;
      insertUtterance.run(session.call.id, u.seq, u.speaker, u.isRep ? 1 : 0, u.text, Math.round(u.atMs));
    }
    insertEvent.run(session.call.id, event.type, JSON.stringify(event), Date.now());
  });
}

export function listCalls(limit = 50): Record<string, unknown>[] {
  return getDb()
    .prepare(
      `SELECT id, source, status, origin, prospect_company, started_at, ended_at FROM calls ORDER BY started_at DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
}

export function storedEvents(callId: string): WingmanEvent[] {
  const rows = getDb().prepare(`SELECT payload FROM events WHERE call_id = ? ORDER BY id`).all(callId) as {
    payload: string;
  }[];
  return rows.map((r) => JSON.parse(r.payload) as WingmanEvent);
}

export function callExists(callId: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM calls WHERE id = ?`).get(callId));
}
