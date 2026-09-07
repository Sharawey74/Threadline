-- V0 tables only. Schema §8 and §10.
--
-- The stored half holds ONLY what a file cannot: sessions, hours, page
-- positions, notes, anchors. Everything derivable from the plan file or the
-- folder tree is re-read on every scan and never persisted, so deleting this
-- database costs the user their history and nothing else.
--
-- Deferred to V1: search (fts5), outline_entry, duplicate_group.
-- Deferred to V2: tag, tagging, entity_link, competency_note, screenshot_meta.

-- ─── meta ────────────────────────────────────────────────────────────
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ─── source files: change detection for the derived model ────────────
CREATE TABLE source_file (
  path         TEXT PRIMARY KEY,      -- relative to the career root
  content_hash TEXT NOT NULL,
  mtime        INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  last_parsed  INTEGER NOT NULL,
  parse_status TEXT NOT NULL          -- ok | error
);

-- ─── artifacts: any file or link Threadline has ever seen ────────────
CREATE TABLE artifact (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,         -- file | link
  path         TEXT UNIQUE,           -- relative; NULL for links
  url          TEXT UNIQUE,           -- NULL for files
  title        TEXT,
  ext          TEXT,
  content_hash TEXT,                  -- duplicate detection
  size         INTEGER,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ok'   -- ok | missing | unreachable
);
CREATE INDEX idx_artifact_hash ON artifact(content_hash);

-- ─── where you stopped ───────────────────────────────────────────────
CREATE TABLE artifact_position (
  artifact_id INTEGER PRIMARY KEY REFERENCES artifact(id) ON DELETE CASCADE,
  page        INTEGER,                -- PDF page
  scroll_pct  REAL,                   -- markdown / html
  updated_at  INTEGER NOT NULL
);

-- ─── sessions: the instrument ────────────────────────────────────────
CREATE TABLE session (
  id           INTEGER PRIMARY KEY,
  scope_kind   TEXT NOT NULL,         -- topic | project | plan_item | career
  scope_ref    TEXT NOT NULL,         -- topic slug, folder path, or anchor
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  active_secs  INTEGER NOT NULL DEFAULT 0,   -- idle already excluded
  end_reason   TEXT,                  -- switch | idle | app_close | manual
  note         TEXT,                  -- the exit note; NULL is normal
  note_source  TEXT                   -- typed | edited_draft | skipped
);
CREATE INDEX idx_session_scope ON session(scope_kind, scope_ref, started_at);
CREATE INDEX idx_session_start ON session(started_at);

CREATE TABLE artifact_access (
  id          INTEGER PRIMARY KEY,
  artifact_id INTEGER NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  session_id  INTEGER REFERENCES session(id) ON DELETE SET NULL,
  opened_at   INTEGER NOT NULL,
  seconds     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_access_artifact ON artifact_access(artifact_id, opened_at);

CREATE TABLE session_artifact (
  session_id  INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  seconds     INTEGER NOT NULL DEFAULT 0,
  was_edited  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, artifact_id)
);

-- ─── anchors: bind stored history to derived plan items ──────────────
-- The only table referencing derived content, and it references it by text
-- hash, never by line number. See Schema §5.
CREATE TABLE item_anchor (
  anchor      TEXT PRIMARY KEY,       -- sha256 of normalised text
  role        TEXT NOT NULL,          -- schedule | curriculum | scope | admin
  section     TEXT NOT NULL,
  text        TEXT NOT NULL,          -- last seen text, for fuzzy re-anchoring
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  orphaned_at INTEGER                 -- set when it leaves the file; never deleted
);

CREATE TABLE item_anchor_history (
  id     INTEGER PRIMARY KEY,
  anchor TEXT NOT NULL REFERENCES item_anchor(anchor),
  event  TEXT NOT NULL,               -- created | reworded | checked | unchecked | orphaned
  detail TEXT,
  at     INTEGER NOT NULL
);
CREATE INDEX idx_anchor_history ON item_anchor_history(anchor, at);

CREATE TABLE item_session (
  anchor     TEXT NOT NULL REFERENCES item_anchor(anchor),
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  seconds    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (anchor, session_id)
);
