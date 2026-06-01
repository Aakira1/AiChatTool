import crypto from "node:crypto";
import { db } from "../client.js";

const upsertStatement = db.prepare(`
  INSERT INTO oauth_tokens (id, user_email, provider, access_token, refresh_token, expires_at, scope, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_email, provider) DO UPDATE SET
    access_token = excluded.access_token,
    refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
    expires_at = excluded.expires_at,
    scope = excluded.scope,
    metadata = COALESCE(excluded.metadata, oauth_tokens.metadata),
    updated_at = datetime('now')
`);

const selectStatement = db.prepare(
  `SELECT * FROM oauth_tokens WHERE user_email = ? AND provider = ?`,
);

const selectAllStatement = db.prepare(
  `SELECT provider, scope, expires_at, updated_at FROM oauth_tokens WHERE user_email = ?`,
);

const deleteStatement = db.prepare(
  `DELETE FROM oauth_tokens WHERE user_email = ? AND provider = ?`,
);

export function saveOAuthToken(userEmail, provider, { accessToken, refreshToken, expiresAt, scope, metadata }) {
  upsertStatement.run(
    crypto.randomUUID(),
    userEmail,
    provider,
    accessToken,
    refreshToken ?? null,
    expiresAt ?? null,
    scope ?? null,
    metadata ? JSON.stringify(metadata) : null,
  );
}

export function getOAuthToken(userEmail, provider) {
  const row = selectStatement.get(userEmail, provider);
  if (!row) return null;
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

export function listConnectedProviders(userEmail) {
  return selectAllStatement.all(userEmail);
}

export function deleteOAuthToken(userEmail, provider) {
  deleteStatement.run(userEmail, provider);
}
