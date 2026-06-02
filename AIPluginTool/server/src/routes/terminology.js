import { Router } from "express";
import { z } from "zod";
import { terminologyMappings } from "../data/terminology.js";
import {
  addTerminologyMapping,
  deleteTerminologyMapping,
  hideBuiltinTerm,
  listCustomTerminology,
  listHiddenTerms,
} from "../db/repositories/terminologyRepo.js";

const BUILTIN_PREFIX = "builtin:";

export const terminologyRouter = Router();

const termSchema = z.object({
  ciTerm: z.string().trim().min(1).max(120),
  ciaTerm: z.string().trim().min(1).max(120),
  notes: z.array(z.string().trim().min(1).max(400)).max(10).optional(),
});

terminologyRouter.get("/", (_request, response) => {
  const hidden = new Set(listHiddenTerms());
  const builtins = terminologyMappings
    .filter((entry) => !hidden.has(entry.ciTerm))
    .map((entry) => ({ ...entry, id: `${BUILTIN_PREFIX}${entry.ciTerm}`, custom: false }));
  response.json({ mappings: [...listCustomTerminology(), ...builtins] });
});

terminologyRouter.post("/", (request, response) => {
  const parsed = termSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid terminology payload" });
    return;
  }
  const mapping = addTerminologyMapping({
    ciTerm: parsed.data.ciTerm,
    ciaTerm: parsed.data.ciaTerm,
    notes: (parsed.data.notes ?? []).filter(Boolean),
  });
  response.status(201).json({ mapping });
});

terminologyRouter.delete("/:id", (request, response) => {
  const { id } = request.params;
  if (id.startsWith(BUILTIN_PREFIX)) {
    hideBuiltinTerm(id.slice(BUILTIN_PREFIX.length));
    response.json({ ok: true });
    return;
  }
  const removed = deleteTerminologyMapping(id);
  if (!removed) {
    response.status(404).json({ error: "Term not found" });
    return;
  }
  response.json({ ok: true });
});
