-- Run PRAGMA foreign_keys = ON per-request in Worker (not effective here at schema level)

CREATE TABLE IF NOT EXISTS servers (
  machine_id    TEXT PRIMARY KEY,
  hostname      TEXT NOT NULL,
  last_seen     INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'idle',
  agent_version TEXT
);

CREATE TABLE IF NOT EXISTS actions (
  id          TEXT PRIMARY KEY,
  machine_id  TEXT NOT NULL,
  type        TEXT NOT NULL,         -- get_link | kill | recreate
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (machine_id) REFERENCES servers(machine_id)
);

CREATE INDEX IF NOT EXISTS idx_actions_machine
  ON actions(machine_id, status, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  machine_id  TEXT PRIMARY KEY,
  link        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (machine_id) REFERENCES servers(machine_id)
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO config (key, value) VALUES ('idle_beacon_interval', '60');
INSERT OR IGNORE INTO config (key, value) VALUES ('action_expiry_hours', '24');
INSERT OR IGNORE INTO config (key, value) VALUES ('upterm_server', 'ssh://uptermd.upterm.dev:22');
INSERT OR IGNORE INTO config (key, value) VALUES ('operator_authorized_key', '');

CREATE TABLE IF NOT EXISTS web_sessions (
  token      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web_sessions_expires
  ON web_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  web_password  TEXT NOT NULL  -- bcrypt hash
);
