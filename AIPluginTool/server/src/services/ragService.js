import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terminologyMappings } from "../data/terminology.js";
import {
  getAllCases,
  getCasesBySource,
  replaceCasesForSource,
} from "../db/repositories/caseRepo.js";
import { chunkText } from "../utils/textChunk.js";
import { parseCsvText } from "../utils/csvParser.js";
import { embedTexts, isEmbeddingConfigured } from "./embeddingService.js";
import { isVectorizeConfigured, queryVectors, upsertVectors } from "./vectorizeService.js";
import { getVectorizeConfig } from "../config/env.js";

const EMBED_BATCH = 16;
const UPSERT_BATCH = 100;

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(serverRoot, "..");

function stableId(prefix, key) {
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `${prefix}-${hash}`;
}

function truncateMeta(value, max = 480) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function isRagEnabled() {
  return isVectorizeConfigured() && isEmbeddingConfigured();
}

async function embedInBatches(texts) {
  const vectors = [];
  for (let index = 0; index < texts.length; index += EMBED_BATCH) {
    const slice = texts.slice(index, index + EMBED_BATCH);
    const batchVectors = await embedTexts(slice);
    vectors.push(...batchVectors);
  }
  return vectors;
}

async function upsertInBatches(records) {
  let total = 0;
  for (let index = 0; index < records.length; index += UPSERT_BATCH) {
    const slice = records.slice(index, index + UPSERT_BATCH);
    const result = await upsertVectors(slice);
    total += result.count;
  }
  return total;
}

function buildRecordsFromChunks(chunks, { idPrefix, title, sourceType, extraMetadata = {} }) {
  return chunks.map((chunk, index) => ({
    id: stableId(idPrefix, `${title}-${index}-${chunk.slice(0, 40)}`),
    text: chunk,
    title,
    sourceType,
    chunkIndex: index,
    ...extraMetadata,
  }));
}

async function upsertTextRecords(records) {
  if (!records.length) {
    return 0;
  }
  const texts = records.map((record) => record.text);
  const vectors = await embedInBatches(texts);
  const payload = records.map((record, index) => ({
    id: record.id,
    values: vectors[index],
    metadata: {
      sourceType: record.sourceType,
      title: truncateMeta(record.title, 120),
      snippet: truncateMeta(record.text),
      ...(record.source ? { source: record.source } : {}),
      ...(record.caseId ? { caseId: record.caseId } : {}),
      ...(record.ciTerm ? { ciTerm: record.ciTerm } : {}),
      ...(record.ciaTerm ? { ciaTerm: record.ciaTerm } : {}),
      ...(record.fileName ? { fileName: record.fileName } : {}),
      ...(record.conversationId ? { conversationId: record.conversationId } : {}),
    },
  }));
  return upsertInBatches(payload);
}

export function buildTerminologyRecords() {
  const records = [];
  for (const entry of terminologyMappings) {
    const text = [
      `Ci term: ${entry.ciTerm}`,
      `CiA term: ${entry.ciaTerm}`,
      `Notes: ${entry.notes.join(" ")}`,
      `Sources: ${entry.sources.map((s) => s.title).join("; ")}`,
    ].join("\n");
    const chunks = chunkText(text);
    records.push(
      ...buildRecordsFromChunks(chunks, {
        idPrefix: "term",
        title: `${entry.ciTerm} → ${entry.ciaTerm}`,
        sourceType: "terminology",
        ciTerm: entry.ciTerm,
        ciaTerm: entry.ciaTerm,
      }),
    );
  }
  return records;
}

export function buildCaseRecords(cases) {
  const records = [];
  for (const caseItem of cases) {
    const text = [
      `Source: ${caseItem.source}`,
      `Case ID: ${caseItem.caseId}`,
      `Status: ${caseItem.status}`,
      `Topic: ${caseItem.topic ?? "n/a"}`,
      `Search term: ${caseItem.searchTerm ?? "n/a"}`,
      `Resolution: ${caseItem.resolution ?? "n/a"}`,
      `Search success: ${caseItem.searchSuccess ? "yes" : "no"}`,
    ].join("\n");
    const chunks = chunkText(text);
    records.push(
      ...buildRecordsFromChunks(chunks, {
        idPrefix: `case-${caseItem.source}`,
        title: `[${caseItem.source}] ${caseItem.caseId}`,
        sourceType: "case",
        source: caseItem.source,
        caseId: caseItem.caseId,
      }),
    );
  }
  return records;
}

export async function ingestTerminology() {
  const records = buildTerminologyRecords();
  const count = await upsertTextRecords(records);
  return { terminology: count };
}

export async function ingestCases(source) {
  const cases = source ? getCasesBySource(source) : getAllCases();
  const records = buildCaseRecords(cases);
  const count = await upsertTextRecords(records);
  return { cases: count, source: source ?? "all" };
}

export async function ingestAttachments(conversationId, attachments = []) {
  if (!attachments.length) {
    return { attachments: 0 };
  }

  const records = [];
  for (const file of attachments) {
    const chunks = chunkText(file.content ?? "");
    records.push(
      ...buildRecordsFromChunks(chunks, {
        idPrefix: `att-${conversationId}`,
        title: file.name,
        sourceType: "attachment",
        fileName: file.name,
        conversationId,
      }),
    );
  }

  const count = await upsertTextRecords(records);
  return { attachments: count };
}

export async function rebuildKnowledgeIndex({ importSamples = true } = {}) {
  if (!isRagEnabled()) {
    throw new Error(
      "RAG requires VECTORIZE_INDEX_NAME plus CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
    );
  }

  const stats = {
    terminology: 0,
    cases: 0,
    samplesImported: { ci: 0, cia: 0 },
  };

  if (importSamples && getAllCases().length === 0) {
    const ciPath = path.join(repoRoot, "sample-data", "ci_cases.csv");
    const ciaPath = path.join(repoRoot, "sample-data", "cia_cases.csv");
    try {
      const [ciCsv, ciaCsv] = await Promise.all([
        fs.readFile(ciPath, "utf8"),
        fs.readFile(ciaPath, "utf8"),
      ]);
      stats.samplesImported.ci = replaceCasesForSource("ci", parseCsvText(ciCsv)).imported;
      stats.samplesImported.cia = replaceCasesForSource("cia", parseCsvText(ciaCsv)).imported;
    } catch (error) {
      console.warn("Sample CSV import skipped during RAG rebuild:", error.message);
    }
  }

  stats.terminology = (await ingestTerminology()).terminology;
  stats.cases = (await ingestCases()).cases;

  return stats;
}

export async function retrieveKnowledge(query, { topK } = {}) {
  if (!isRagEnabled()) {
    return [];
  }

  const config = getVectorizeConfig();
  const limit = topK ?? config.topK;
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return [];
  }

  try {
    const [queryVector] = await embedTexts([trimmed]);
    const matches = await queryVectors(queryVector, { topK: limit });

    return matches
      .map((match) => ({
        id: match.id,
        score: match.score ?? 0,
        title: match.metadata?.title ?? match.id,
        snippet: match.metadata?.snippet ?? "",
        sourceType: match.metadata?.sourceType ?? "knowledge",
        source: match.metadata?.source ?? null,
        caseId: match.metadata?.caseId ?? null,
        ciTerm: match.metadata?.ciTerm ?? null,
        ciaTerm: match.metadata?.ciaTerm ?? null,
        fileName: match.metadata?.fileName ?? null,
      }))
      .filter((item) => item.score > 0.55);
  } catch (error) {
    console.warn("Vectorize retrieval skipped:", error.message);
    return [];
  }
}

export function ragChunksToInsightSources(chunks) {
  return chunks.map((chunk) => ({
    title: chunk.title,
    meta: `Vectorize • ${chunk.sourceType} • ${Math.round(chunk.score * 100)}% match`,
  }));
}

export function ragChunksToPromptBlock(chunks) {
  if (!chunks.length) {
    return "No vector knowledge matched this question.";
  }
  return chunks
    .map(
      (chunk, index) =>
        `${index + 1}. [${chunk.sourceType}] ${chunk.title} (relevance ${(chunk.score * 100).toFixed(0)}%)\n` +
        `   ${chunk.snippet}`,
    )
    .join("\n");
}
