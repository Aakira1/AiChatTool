import { Router } from "express";
import { terminologyMappings } from "../data/terminology.js";

export const terminologyRouter = Router();

terminologyRouter.get("/", (_request, response) => {
  response.json({ mappings: terminologyMappings });
});
