import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

const absolutePath = path.resolve(env.dbPath);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

export const db = new DatabaseSync(absolutePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('ci', 'cia')),
    case_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT,
    resolved_at TEXT,
    search_term TEXT,
    resolution TEXT,
    search_success INTEGER NOT NULL DEFAULT 0,
    topic TEXT,
    UNIQUE(source, case_id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cases_source_status ON cases(source, status);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cases_search_term ON cases(search_term);
`);

try {
  db.exec(`ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
} catch {
  /* column exists */
}

try {
  db.exec(`ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
} catch {
  /* column exists */
}

const defaultPreferences = [
  ["response_style", "concise and practical"],
  ["tone", "friendly and direct"],
  ["format", "use bullet points when listing steps"],
  ["profile_name", "Ayden Beggs"],
  ["profile_email", "ayden.beggs@technologyone.com"],
  ["profile_role", "Transition Analyst"],
  ["profile_team", "Ci → CiA Transition Program"],
  ["profile_environment", "demo"],
  ["notifications_enabled", "true"],
];

const insertPreference = db.prepare(`
  INSERT OR IGNORE INTO user_preferences (key, value) VALUES (?, ?)
`);

for (const [key, value] of defaultPreferences) {
  insertPreference.run(key, value);
}
