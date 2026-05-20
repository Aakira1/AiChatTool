import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../utils/password.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const llmProvider = process.env.LLM_PROVIDER ?? "cloudflare";
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const authEnabled = process.env.AUTH_ENABLED === "true";
const demoAdminEmail = "admin@demo.local";
const demoAdminPassword = "Admin12345!";
const authEmail =
  process.env.AUTH_EMAIL || (authEnabled ? demoAdminEmail : "");
const authPasswordPlain =
  process.env.AUTH_PASSWORD || (authEnabled ? demoAdminPassword : "");
const authPasswordHash =
  process.env.AUTH_PASSWORD_HASH ||
  (authPasswordPlain ? hashPassword(authPasswordPlain) : "");

if (authEnabled && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) {
  console.warn(
    "AUTH_ENABLED is true but AUTH_SECRET is missing or too short (min 32 chars).",
  );
}

if (authEnabled && !process.env.AUTH_EMAIL && !process.env.AUTH_PASSWORD) {
  console.log(`Auth: using demo admin (${demoAdminEmail}) — change AUTH_EMAIL/AUTH_PASSWORD in production.`);
}

const vectorizeIndexName = process.env.VECTORIZE_INDEX_NAME?.trim() ?? "";
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: clientOrigins[0] ?? "http://localhost:5173",
  clientOrigins,
  trustProxy: process.env.TRUST_PROXY === "true",
  serveClient: process.env.SERVE_CLIENT === "true",
  authEnabled,
  authEmail,
  authPasswordHash,
  authSecret: process.env.AUTH_SECRET ?? "dev-only-change-me-use-32-char-secret-min",
  sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_HOURS ?? 168) * 60 * 60 * 1000,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  llmProvider,
  cloudflareAccountId,
  cloudflareApiToken,
  cloudflareModel:
    process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.1-8b-instruct",
  vectorizeIndexName,
  vectorizeEnabled: Boolean(vectorizeIndexName && cloudflareAccountId && cloudflareApiToken),
  embeddingModel:
    process.env.CLOUDFLARE_EMBEDDING_MODEL ?? "@cf/baai/bge-base-en-v1.5",
  ragTopK: Number(process.env.RAG_TOP_K ?? 8),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
  dbPath: process.env.DB_PATH ?? "./data/chat.db",
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
      missingConfigMessage:
        "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in server/.env.",
    };
  }

  return {
    apiKey: env.openAiApiKey,
    baseUrl: env.openAiBaseUrl,
    model: env.openAiModel,
    missingConfigMessage:
      "OpenAI is not configured. Set OPENAI_API_KEY in server/.env to enable real model responses.",
  };
}
