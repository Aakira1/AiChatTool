import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  ingestCases,
  ingestTerminology,
  isRagEnabled,
  rebuildKnowledgeIndex,
} from "../services/ragService.js";
import { getVectorizeIndexInfo, isVectorizeConfigured } from "../services/vectorizeService.js";
import { isEmbeddingConfigured } from "../services/embeddingService.js";

export const knowledgeRouter = Router();

knowledgeRouter.get("/status", async (_request, response) => {
  const indexInfo = await getVectorizeIndexInfo();
  response.json({
    ragEnabled: isRagEnabled(),
    vectorizeConfigured: isVectorizeConfigured(),
    embeddingsConfigured: isEmbeddingConfigured(),
    indexName: env.vectorizeIndexName || null,
    embeddingModel: env.embeddingModel,
    topK: env.ragTopK,
    index: indexInfo,
  });
});

const rebuildSchema = z.object({
  importSamples: z.boolean().optional(),
});

knowledgeRouter.post("/rebuild", async (request, response, next) => {
  const parsed = rebuildSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid rebuild payload" });
    return;
  }

  try {
    const stats = await rebuildKnowledgeIndex({
      importSamples: parsed.data.importSamples ?? true,
    });
    response.status(201).json({
      ok: true,
      message: "Knowledge index rebuilt. New vectors may take a few seconds to query.",
      stats,
    });
  } catch (error) {
    next(error);
  }
});

knowledgeRouter.post("/ingest/terminology", async (_request, response, next) => {
  try {
    const stats = await ingestTerminology();
    response.status(201).json(stats);
  } catch (error) {
    next(error);
  }
});

knowledgeRouter.post("/ingest/cases", async (request, response, next) => {
  try {
    const source = request.body?.source;
    const stats = await ingestCases(
      source === "ci" || source === "cia" ? source : undefined,
    );
    response.status(201).json(stats);
  } catch (error) {
    next(error);
  }
});
