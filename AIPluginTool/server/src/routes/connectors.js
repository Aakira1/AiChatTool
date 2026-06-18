import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { CONNECTORS, PROVIDER_AUTH, BASIC_AUTH_PROVIDERS, isBasicAuthProvider, getConnector, connectorsForProvider } from "../services/connectorRegistry.js";
import {
  buildAuthorizeUrl,
  createOAuthState,
  verifyOAuthState,
  exchangeCodeForToken,
  isOAuthProviderConfigured,
  resolveProviderCreds,
  resolveBasicAuthCreds,
  saveBasicAuthToken,
} from "../services/oauthService.js";
import { searchConnectors } from "../services/connectorService.js";
import { deleteOAuthToken, listConnectedProviders } from "../db/repositories/oauthRepo.js";
import {
  deleteProviderConfig,
  getProviderConfig,
  saveProviderConfig,
} from "../db/repositories/oauthProviderConfigRepo.js";

export const connectorsRouter = Router();

function userKey(request) {
  return request.user?.email || env.authEmail || "local-user";
}

function safeReturnTo(returnTo) {
  if (typeof returnTo === "string") {
    try {
      const url = new URL(returnTo);
      if (env.clientOrigins.includes(url.origin)) return returnTo;
    } catch {
      /* ignore */
    }
  }
  return env.clientOrigin;
}

// GET /api/connectors — status of every connector for the current user.
connectorsRouter.get("/", (request, response) => {
  const connectedProviders = new Set(listConnectedProviders(userKey(request)).map((row) => row.provider));
  response.json({
    connectors: CONNECTORS.map((c) => ({
      id: c.id,
      label: c.label,
      provider: c.provider,
      icon: c.icon,
      description: c.description,
      configured: isOAuthProviderConfigured(c.provider),
      connected: connectedProviders.has(c.provider),
    })),
  });
});

// GET /api/connectors/providers — credential status per provider.
connectorsRouter.get("/providers", (_request, response) => {
  const oauthProviders = Object.keys(PROVIDER_AUTH).map((provider) => {
    const row = getProviderConfig(provider);
    const creds = resolveProviderCreds(provider);
    const envCreds = env.oauthProviders[provider];
    const fromEnv = Boolean(envCreds?.clientId && envCreds?.clientSecret) && !row;
    return {
      provider,
      authType: "oauth",
      configured: isOAuthProviderConfigured(provider),
      fromEnv,
      clientId: creds?.clientId ?? "",
      hasSecret: Boolean(creds?.clientSecret),
      tenant: creds?.tenant ?? "common",
      redirectUri: creds?.redirectUri ?? "",
      supportsTenant: provider === "microsoft",
      connectors: connectorsForProvider(provider).map((c) => ({ id: c.id, label: c.label })),
    };
  });

  const basicProviders = Object.keys(BASIC_AUTH_PROVIDERS).map((provider) => {
    const creds = resolveBasicAuthCreds(provider);
    return {
      provider,
      authType: "basic",
      configured: isOAuthProviderConfigured(provider),
      fromEnv: false,
      email: creds?.email ?? "",
      siteUrl: creds?.siteUrl ?? "",
      hasToken: Boolean(creds?.apiToken),
      connectors: connectorsForProvider(provider).map((c) => ({ id: c.id, label: c.label })),
    };
  });

  response.json({ providers: [...oauthProviders, ...basicProviders] });
});

const providerConfigSchema = z.object({
  clientId: z.string().trim().max(400),
  clientSecret: z.string().max(800).optional(),
  tenant: z.string().trim().max(200).optional(),
  redirectUri: z.string().trim().max(600).optional(),
});

// PUT /api/connectors/providers/:provider — save credentials (OAuth or Basic Auth).
connectorsRouter.put("/providers/:provider", (request, response) => {
  const { provider } = request.params;
  if (!PROVIDER_AUTH[provider] && !isBasicAuthProvider(provider)) {
    response.status(404).json({ error: "Unknown provider" });
    return;
  }
  const parsed = providerConfigSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid provider config" });
    return;
  }
  saveProviderConfig(provider, {
    clientId: parsed.data.clientId,
    clientSecret: parsed.data.clientSecret ? parsed.data.clientSecret : null,
    tenant: parsed.data.tenant,
    redirectUri: parsed.data.redirectUri,
  });
  // For Basic Auth providers, auto-connect immediately after saving credentials.
  if (isBasicAuthProvider(provider)) {
    try {
      saveBasicAuthToken(provider, userKey(request));
    } catch {
      // Credentials may be incomplete — they'll connect once all fields are filled.
    }
  }
  response.json({ ok: true, configured: isOAuthProviderConfigured(provider) });
});

// DELETE /api/connectors/providers/:provider — clear stored credentials.
connectorsRouter.delete("/providers/:provider", (request, response) => {
  const { provider } = request.params;
  if (!PROVIDER_AUTH[provider] && !isBasicAuthProvider(provider)) {
    response.status(404).json({ error: "Unknown provider" });
    return;
  }
  deleteProviderConfig(provider);
  deleteOAuthToken(userKey(request), provider);
  response.json({ ok: true, configured: isOAuthProviderConfigured(provider) });
});

// GET /api/connectors/:id/connect — start OAuth, redirect to provider.
connectorsRouter.get("/:id/connect", (request, response) => {
  const connector = getConnector(request.params.id);
  if (!connector) {
    response.status(404).json({ error: "Unknown connector" });
    return;
  }
  if (!isOAuthProviderConfigured(connector.provider)) {
    response.status(400).json({
      error: `${connector.label} is not configured on the server. Add ${connector.provider.toUpperCase()}_CLIENT_ID and _CLIENT_SECRET to server/.env.`,
    });
    return;
  }
  const state = createOAuthState({
    userEmail: userKey(request),
    provider: connector.provider,
    returnTo: safeReturnTo(request.query.returnTo),
  });
  response.redirect(buildAuthorizeUrl(connector.provider, state));
});

// GET /api/connectors/callback/:provider — OAuth redirect target.
connectorsRouter.get("/callback/:provider", async (request, response) => {
  const { code, state, error: oauthError } = request.query;
  const data = verifyOAuthState(state);

  const fail = (reason) => {
    const target = safeReturnTo(data?.returnTo);
    response.redirect(`${target}#connector=${request.params.provider}&status=error&reason=${encodeURIComponent(reason)}`);
  };

  if (oauthError) return fail(String(oauthError));
  if (!data || data.provider !== request.params.provider) return fail("invalid_state");
  if (!code) return fail("missing_code");

  try {
    await exchangeCodeForToken(request.params.provider, String(code), data.userEmail);
    const target = safeReturnTo(data.returnTo);
    response.redirect(`${target}#connector=${request.params.provider}&status=connected`);
  } catch (error) {
    fail(error.message);
  }
});

// POST /api/connectors/providers/:provider/test — verify basic auth credentials work.
connectorsRouter.post("/providers/:provider/test", async (request, response) => {
  const { provider } = request.params;
  if (!isBasicAuthProvider(provider)) {
    response.status(400).json({ error: "Only basic auth providers support credential testing." });
    return;
  }
  const creds = resolveBasicAuthCreds(provider);
  if (!creds?.email || !creds?.apiToken || !creds?.siteUrl) {
    response.status(400).json({ ok: false, error: "No credentials saved — fill in Site URL, Email and API Token first." });
    return;
  }
  const basicHeader = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")}`;
  try {
    // Test Jira with /rest/api/3/myself, Confluence with /wiki/rest/api/space?limit=1
    const tests = [
      { label: "Jira",       url: `${creds.siteUrl}/rest/api/3/myself` },
      { label: "Confluence", url: `${creds.siteUrl}/wiki/rest/api/space?limit=1` },
    ];
    const results = await Promise.all(
      tests.map(async ({ label, url }) => {
        try {
          const res = await fetch(url, { headers: { Authorization: basicHeader, Accept: "application/json" } });
          const body = await res.text().catch(() => "");
          let hint = "";
          if (!res.ok) {
            try {
              const json = JSON.parse(body);
              hint = json.message || json.error_description || json.error || JSON.stringify(json).slice(0, 200);
            } catch {
              hint = body.slice(0, 200);
            }
          }
          return { label, ok: res.ok, status: res.status, hint: hint || undefined };
        } catch (err) {
          return { label, ok: false, error: err.message };
        }
      }),
    );
    const allOk = results.every((r) => r.ok);
    response.json({ ok: allOk, results });
  } catch (err) {
    response.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/connectors/:provider/disconnect
connectorsRouter.post("/:provider/disconnect", (request, response) => {
  deleteOAuthToken(userKey(request), request.params.provider);
  response.json({ ok: true });
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  connectorIds: z.array(z.string()).min(1).max(6),
});

// POST /api/connectors/search — preview connector results (used by UI/testing).
connectorsRouter.post("/search", async (request, response) => {
  const parsed = searchSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid search payload" });
    return;
  }
  const grouped = await searchConnectors(parsed.data.connectorIds, userKey(request), parsed.data.query);
  response.json({ results: grouped });
});
