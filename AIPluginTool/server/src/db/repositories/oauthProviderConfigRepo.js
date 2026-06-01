import { db } from "../client.js";

const upsertStatement = db.prepare(`
  INSERT INTO oauth_provider_config (provider, client_id, client_secret, tenant, redirect_uri)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(provider) DO UPDATE SET
    client_id = excluded.client_id,
    client_secret = COALESCE(excluded.client_secret, oauth_provider_config.client_secret),
    tenant = excluded.tenant,
    redirect_uri = excluded.redirect_uri,
    updated_at = datetime('now')
`);

const selectStatement = db.prepare(
  `SELECT * FROM oauth_provider_config WHERE provider = ?`,
);

const deleteStatement = db.prepare(
  `DELETE FROM oauth_provider_config WHERE provider = ?`,
);

/**
 * Upsert provider OAuth credentials. Pass clientSecret === null to keep the
 * existing stored secret (so the UI can re-save without re-entering it).
 */
export function saveProviderConfig(provider, { clientId, clientSecret, tenant, redirectUri }) {
  upsertStatement.run(
    provider,
    clientId ?? "",
    clientSecret ?? null,
    tenant ?? null,
    redirectUri ?? null,
  );
}

export function getProviderConfig(provider) {
  return selectStatement.get(provider) ?? null;
}

export function deleteProviderConfig(provider) {
  deleteStatement.run(provider);
}
