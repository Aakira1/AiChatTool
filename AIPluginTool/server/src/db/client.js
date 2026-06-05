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

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    scope TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_email, provider)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_provider_config (
    provider TEXT PRIMARY KEY,
    client_id TEXT,
    client_secret TEXT,
    tenant TEXT,
    redirect_uri TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS terminology_mappings (
    id TEXT PRIMARY KEY,
    ci_term TEXT NOT NULL,
    cia_term TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS terminology_hidden (
    ci_term TEXT PRIMARY KEY
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    type TEXT NOT NULL,
    actor_email TEXT,
    actor_name TEXT,
    post_id TEXT,
    comment_id TEXT,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email, read);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_profile_preferences (
    user_email TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_email, key)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS forums (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS forum_posts (
    id TEXT PRIMARY KEY,
    forum_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(forum_id) REFERENCES forums(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS forum_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    body TEXT NOT NULL,
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(post_id) REFERENCES forum_posts(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS forum_votes (
    user_email TEXT NOT NULL,
    post_id TEXT NOT NULL,
    value INTEGER NOT NULL,
    PRIMARY KEY (user_email, post_id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_forum_posts_forum ON forum_posts(forum_id);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_email TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`);

// Per-user feature/plugin grants. A row means the user has access to that plugin
// (admins implicitly have all of them, resolved in code).
db.exec(`
  CREATE TABLE IF NOT EXISTS user_plugins (
    email TEXT NOT NULL,
    plugin TEXT NOT NULL,
    granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (email, plugin)
  );
`);

try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
} catch {
  /* column exists */
}

try {
  db.exec(`ALTER TABLE forum_posts ADD COLUMN accepted_comment_id TEXT`);
} catch {
  /* column exists */
}

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
