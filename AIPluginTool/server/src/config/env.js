import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_AUTH_SECRET,
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
} from "./authDefaults.js";
import { hashPassword } from "../utils/password.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

const llmProvider = process.env.LLM_PROVIDER ?? "cloudflare";
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Default on in local dev when AUTH_ENABLED is unset; set AUTH_ENABLED=false to disable. */
const authEnabled =
  process.env.AUTH_ENABLED === "true" ||
  (!isProduction && process.env.AUTH_ENABLED !== "false");

const authEmail = process.env.AUTH_EMAIL || (authEnabled ? DEMO_ADMIN_EMAIL : "");
const authPasswordPlain =
  process.env.AUTH_PASSWORD || (authEnabled ? DEMO_ADMIN_PASSWORD : "");
const authPasswordHash =
  process.env.AUTH_PASSWORD_HASH ||
  (authPasswordPlain ? hashPassword(authPasswordPlain) : "");

const authSecret =
  process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32
    ? process.env.AUTH_SECRET
    : DEFAULT_AUTH_SECRET;

if (authEnabled && process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
  console.warn(
    "AUTH_SECRET is too short (min 32 chars). Using DEFAULT_AUTH_SECRET for this process.",
  );
}

if (authEnabled) {
  console.log(
    `[CiA] Auth enabled — sign in with ${authEmail} (password in server/.env or default Admin12345!)`,
  );
}

const vectorizeIndexName = process.env.VECTORIZE_INDEX_NAME?.trim() ?? "";
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";

const publicServerUrl = process.env.PUBLIC_SERVER_URL ?? `http://localhost:${Number(process.env.PORT ?? 3001)}`;

// OAuth connector providers. One OAuth app per provider; a provider can back
// several connectors (e.g. Microsoft Graph powers OneDrive, SharePoint, Teams).
const oauthProviders = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? `${publicServerUrl}/api/connectors/callback/google`,
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    tenant: process.env.MICROSOFT_TENANT ?? "common",
    redirectUri:
      process.env.MICROSOFT_REDIRECT_URI ?? `${publicServerUrl}/api/connectors/callback/microsoft`,
  },
  atlassian: {
    clientId: process.env.ATLASSIAN_CLIENT_ID ?? "",
    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.ATLASSIAN_REDIRECT_URI ?? `${publicServerUrl}/api/connectors/callback/atlassian`,
  },
};

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: clientOrigins[0] ?? "http://localhost:5173",
  clientOrigins,
  trustProxy: process.env.TRUST_PROXY === "true",
  serveClient: process.env.SERVE_CLIENT === "true",
  authEnabled,
  authEmail,
  authPasswordHash,
  authSecret,
  demoAdminEmail: DEMO_ADMIN_EMAIL,
  sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_HOURS ?? 168) * 60 * 60 * 1000,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  llmProvider,
  cloudflareAccountId,
  cloudflareApiToken,
  cloudflareModel:
    process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.1-8b-instruct",
  vectorizeIndexName,
  vectorizeEnabled:
    process.env.VECTORIZE_ENABLED === "true" &&
    Boolean(vectorizeIndexName && cloudflareAccountId && cloudflareApiToken),
  embeddingModel:
    process.env.CLOUDFLARE_EMBEDDING_MODEL ?? "@cf/baai/bge-base-en-v1.5",
  ragTopK: Number(process.env.RAG_TOP_K ?? 8),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
  llmMaxTokens: Number(process.env.LLM_MAX_TOKENS ?? 4096),
  dbPath: process.env.DB_PATH ?? "./data/chat.db",
  copilotStudioEnabled: process.env.COPILOT_STUDIO_ENABLED === "true",
  copilotStudioDirectLineSecret: process.env.COPILOT_STUDIO_DIRECT_LINE_SECRET ?? "",
  copilotStudioAgentName: process.env.COPILOT_STUDIO_AGENT_NAME ?? "",
  publicServerUrl,
  oauthProviders,
};

export function getEmbeddingConfig() {
  return {
    accountId: env.cloudflareAccountId,
    apiToken: env.cloudflareApiToken,
    model: env.embeddingModel,
  };
}

export function getVectorizeConfig() {
  return {
    enabled: env.vectorizeEnabled,
    accountId: env.cloudflareAccountId,
    apiToken: env.cloudflareApiToken,
    indexName: env.vectorizeIndexName,
    topK: env.ragTopK,
  };
}

export function getLlmConfig() {
  if (llmProvider === "cloudflare") {
    return {
      apiKey: env.cloudflareApiToken,
      baseUrl: env.cloudflareAccountId
        ? `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/v1`
        : "",
      model: env.cloudflareModel,
      maxTokens: env.llmMaxTokens,
      missingConfigMessage:
        "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in server/.env.",
    };
  }

  return {
    apiKey: env.openAiApiKey,
    baseUrl: env.openAiBaseUrl,
    model: env.openAiModel,
    maxTokens: env.llmMaxTokens,
    missingConfigMessage:
      "OpenAI is not configured. Set OPENAI_API_KEY in server/.env to enable real model responses.",
  };
}
