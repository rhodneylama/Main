/**
 * Every table in the app. Executed on first connection and safe to re-run —
 * each statement is CREATE ... IF NOT EXISTS, so adding a table here is the
 * whole migration.
 */
export const SCHEMA_SQL = `
  /* ------------------------------------------------------------ trainer -- */

  CREATE TABLE IF NOT EXISTS personas (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    title        TEXT NOT NULL,
    company      TEXT NOT NULL,
    industry     TEXT NOT NULL,
    difficulty   INTEGER NOT NULL,
    mood         TEXT NOT NULL,
    personality  TEXT NOT NULL,
    objections   TEXT NOT NULL,
    win_condition TEXT NOT NULL,
    call_types   TEXT NOT NULL,
    voice_hint   TEXT,
    built_in     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calls (
    id           TEXT PRIMARY KEY,
    rep_name     TEXT NOT NULL,
    persona_id   TEXT NOT NULL,
    persona_name TEXT NOT NULL,
    call_type    TEXT NOT NULL,
    difficulty   INTEGER NOT NULL,
    started_at   TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    transcript   TEXT NOT NULL,
    scorecard    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_calls_rep ON calls(rep_name);
  CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  /* --------------------------------------------------------- sales floor - */

  CREATE TABLE IF NOT EXISTS teams (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color_slot INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reps (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL DEFAULT '',
    team_id      TEXT,
    avatar       TEXT NOT NULL DEFAULT '🙂',
    role         TEXT NOT NULL DEFAULT 'rep',
    quota_cents  INTEGER NOT NULL DEFAULT 0,
    ghl_user_id  TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_reps_ghl ON reps(ghl_user_id)
    WHERE ghl_user_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS pipelines (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    stages TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'seed'
  );

  CREATE TABLE IF NOT EXISTS deals (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    contact_name  TEXT NOT NULL DEFAULT '',
    rep_id        TEXT,
    pipeline_id   TEXT NOT NULL,
    pipeline_name TEXT NOT NULL,
    stage_id      TEXT NOT NULL,
    stage_name    TEXT NOT NULL,
    stage_order   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'open',
    value_cents   INTEGER NOT NULL DEFAULT 0,
    source        TEXT NOT NULL DEFAULT 'manual',
    external_id   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    closed_at     TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_external ON deals(external_id)
    WHERE external_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_deals_rep ON deals(rep_id);
  CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);

  CREATE TABLE IF NOT EXISTS activities (
    id          TEXT PRIMARY KEY,
    rep_id      TEXT NOT NULL,
    type        TEXT NOT NULL,
    subject     TEXT NOT NULL DEFAULT '',
    points      INTEGER NOT NULL DEFAULT 0,
    value_cents INTEGER NOT NULL DEFAULT 0,
    occurred_at TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    deal_id     TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external
    ON activities(external_id) WHERE external_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_activities_rep ON activities(rep_id);
  CREATE INDEX IF NOT EXISTS idx_activities_occurred ON activities(occurred_at DESC);

  CREATE TABLE IF NOT EXISTS rep_badges (
    rep_id     TEXT NOT NULL,
    badge_key  TEXT NOT NULL,
    awarded_at TEXT NOT NULL,
    PRIMARY KEY (rep_id, badge_key)
  );

  CREATE TABLE IF NOT EXISTS competitions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    metric      TEXT NOT NULL DEFAULT 'points',
    scope       TEXT NOT NULL DEFAULT 'rep',
    starts_at   TEXT NOT NULL,
    ends_at     TEXT NOT NULL,
    target      INTEGER NOT NULL DEFAULT 0,
    prize       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS celebrations (
    id          TEXT PRIMARY KEY,
    rep_id      TEXT NOT NULL,
    kind        TEXT NOT NULL,
    headline    TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT '',
    value_cents INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_celebrations_created
    ON celebrations(created_at DESC);

  /* ------------------------------------------------------------ training - */

  CREATE TABLE IF NOT EXISTS materials (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    kind         TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT 'General',
    url          TEXT,
    file_path    TEXT,
    file_name    TEXT,
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    duration_min INTEGER NOT NULL DEFAULT 0,
    required     INTEGER NOT NULL DEFAULT 0,
    points       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS material_progress (
    material_id  TEXT NOT NULL,
    rep_id       TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (material_id, rep_id)
  );
`;
