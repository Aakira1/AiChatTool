import { Router } from "express";
import express from "express";
import { z } from "zod";
import { replaceCasesForSource } from "../db/repositories/caseRepo.js";
import { ingestCases } from "../services/ragService.js";
import { normalizeImportedRows, parseCsvText } from "../utils/csvParser.js";

const rowSchema = z.object({
  caseId: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  searchTerm: z.string().optional(),
  resolution: z.string().optional(),
  searchSuccess: z.boolean().optional(),
  topic: z.string().optional(),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1),
});

export const importRouter = Router();

importRouter.use(express.json({ limit: "5mb" }));
importRouter.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

function importRows(source, rows, response) {
  const result = replaceCasesForSource(source, rows);
  void ingestCases(source).catch((error) => {
    console.warn(`Vectorize ingest after ${source} import failed:`, error.message);
  });
  response.status(201).json(result);
}

importRouter.post("/ci", (request, response) => {
  try {
    if (typeof request.body === "string") {
      return importRows("ci", parseCsvText(request.body), response);
    }
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid CI import payload" });
      return;
    }
    importRows("ci", normalizeImportedRows(parsed.data.rows), response);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

importRouter.post("/cia", (request, response) => {
  try {
    if (typeof request.body === "string") {
      return importRows("cia", parseCsvText(request.body), response);
    }
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid CIA import payload" });
      return;
    }
    importRows("cia", normalizeImportedRows(parsed.data.rows), response);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});
