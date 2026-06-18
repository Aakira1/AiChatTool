import crypto from "node:crypto";
import { env } from "../config/env.js";
import { PROVIDER_AUTH, isBasicAuthProvider } from "./connectorRegistry.js";
import { getOAuthToken, saveOAuthToken } from "../db/repositories/oauthRepo.js";
import { getProviderConfig } from "../db/repositories/oauthProviderConfigRepo.js";

/**
 * Effective credentials for a provider: DB-entered values (from the settings UI)
 * take precedence, falling back to the env values from server/.env.
 */
export function resolveProviderCreds(provider) {
  const envCreds = env.oauthProviders[provider];
  if (!envCreds) return null;
  const row = getProviderConfig(provider);
  return {
    clientId: row?.client_id || envCreds.clientId || "",
    clientSecret: row?.client_secret || envCreds.clientSecret || "",
    tenant: row?.tenant || envCreds.tenant || "common",
    redirectUri: row?.redirect_uri || envCreds.redirectUri,
  };
}

/** Credentials for a Basic Auth provider (stored in oauth_provider_config). */
export function resolveBasicAuthCreds(provider) {
  const row = getProviderConfig(provider);
  if (!row?.client_id || !row?.client_secret) return null;
  return {
    email: row.client_id,
    apiToken: row.client_secret,
    siteUrl: (row.redirect_uri || "").replace(/\/$/, ""),
  };
}

/** True when a provider has both a client id and secret (DB or env). */
export function isOAuthProviderConfigured(provider) {
  if (isBasicAuthProvider(provider)) {
    const creds = resolveBasicAuthCreds(provider);
    return Boolean(creds?.email && creds?.apiToken && creds?.siteUrl);
  }
  const creds = resolveProviderCreds(provider);
  return Boolean(creds && creds.clientId && creds.clientSecret);
}

/**
 * Build and persist a Basic Auth token entry from the stored credentials.
 * Call this after saving provider config for a basic auth provider.
 */
export function saveBasicAuthToken(provider, userEmail) {
  const creds = resolveBasicAuthCreds(provider);
  if (!creds?.email || !creds?.apiToken || !creds?.siteUrl) {
    throw new Error("Atlassian credentials incomplete — provide Site URL, Email and API Token.");
  }
  const basicValue = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")}`;
  saveOAuthToken(userEmail, provider, {
    accessToken: basicValue,
    refreshToken: null,
    expiresAt: null,
    scope: null,
    metadata: { siteUrl: creds.siteUrl, email: creds.email },
  });
}

function providerConfig(provider) {
  const auth = PROVIDER_AUTH[provider];
  const creds = resolveProviderCreds(provider);
  if (!auth || !creds) throw new Error(`Unknown OAuth provider: ${provider}`);
  const tenant = creds.tenant ?? "common";
  return {
    ...auth,
    ...creds,
    authorizeUrl: auth.authorizeUrl.replace("{tenant}", tenant),
    tokenUrl: auth.tokenUrl.replace("{tenant}", tenant),
  };
}

// --- Signed state (CSRF + carries the user + return target) ----------------
export function createOAuthState({ userEmail, provider, returnTo }) {
  const payload = Buffer.from(
    JSON.stringify({ userEmail, provider, returnTo, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", env.authSecret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state) {
  if (typeof state !== "string" || !state.includes(".")) return null;
  const [payload, sig] = state.split(".");
  const expected = crypto.createHmac("sha256", env.authSecret).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() - data.ts > 10 * 60 * 1000) return null; // 10 min window
    return data;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(provider, state) {
  const cfg = providerConfig(provider);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scope,
    state,
    ...(cfg.extraAuthParams ?? {}),
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

async function postToken(provider, body) {
  const cfg = providerConfig(provider);
  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error_description || json.error || `Token request failed (${response.status})`);
  }
  return json;
}

function expiryFrom(expiresIn) {
  if (!expiresIn) return null;
  return new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
}

/** Exchange an authorization code for tokens and persist them for the user. */
export async function exchangeCodeForToken(provider, code, userEmail) {
  const cfg = providerConfig(provider);
  const token = await postToken(provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });

  // Atlassian needs the cloud id to address site APIs later.
  let metadata = null;
  if (provider === "atlassian") {
    metadata = await fetchAtlassianResources(token.access_token).catch(() => null);
  }

  saveOAuthToken(userEmail, provider, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: expiryFrom(token.expires_in),
    scope: token.scope,
    metadata,
  });
}

/** Return a valid access token, refreshing if expired. Null if not connected. */
export async function getValidAccessToken(provider, userEmail) {
  const stored = getOAuthToken(userEmail, provider);
  if (!stored) return null;

  // Basic auth tokens never expire — return directly.
  if (isBasicAuthProvider(provider)) {
    return { accessToken: stored.access_token, metadata: stored.metadata };
  }

  const notExpired = stored.expires_at && new Date(stored.expires_at).getTime() - 60_000 > Date.now();
  if (notExpired) return { accessToken: stored.access_token, metadata: stored.metadata };

  if (!stored.refresh_token) {
    // No refresh token but maybe still valid (e.g. no expiry recorded).
    return { accessToken: stored.access_token, metadata: stored.metadata };
  }

  const refreshed = await postToken(provider, {
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
  });

  saveOAuthToken(userEmail, provider, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? stored.refresh_token,
    expiresAt: expiryFrom(refreshed.expires_in),
    scope: refreshed.scope ?? stored.scope,
    metadata: stored.metadata,
  });

  return { accessToken: refreshed.access_token, metadata: stored.metadata };
}

async function fetchAtlassianResources(accessToken) {
  const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const resources = await response.json();
  const first = Array.isArray(resources) ? resources[0] : null;
  return first ? { cloudId: first.id, siteUrl: first.url, siteName: first.name } : null;
}
