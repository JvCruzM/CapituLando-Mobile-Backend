import express, { Router } from "express";
import {
  createCreature,
  deleteCreature,
  findCreature,
  listCreatures,
  sendError,
  updateCreature,
} from "./controllers/creatures.js";
import { creatureSchema, idSchema } from "./schemas/creature.js";

export function createCreatureRouter(authenticate) {
  const router = Router({ mergeParams: true });
  if (authenticate) router.use(authenticate);

  router.use((req, res, next) => {
    if (!idSchema.safeParse(res.locals.principal?.id).success) {
      return sendError(
        res,
        401,
        "UNAUTHORIZED",
        "Entre na sua conta para continuar.",
      );
    }
    if (!idSchema.safeParse(req.params.storyId).success) {
      return sendError(
        res,
        400,
        "INVALID_STORY_ID",
        "Identificador da história inválido.",
      );
    }
    next();
  });

  router.param("creatureId", (_req, res, next, creatureId) => {
    if (!idSchema.safeParse(creatureId).success) {
      return sendError(
        res,
        400,
        "INVALID_CREATURE_ID",
        "Identificador da criatura inválido.",
      );
    }
    next();
  });

  const json = express.json();
  router.get("/", listCreatures);
  router.get("/:creatureId", findCreature);
  router.post("/", json, validateCreature, createCreature);
  router.put("/:creatureId", json, validateCreature, updateCreature);
  router.delete("/:creatureId", deleteCreature);
  router.use(handleCreatureError);
  return router;
}

function validateCreature(req, res, next) {
  const result = creatureSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(
      res,
      400,
      "INVALID_CREATURE",
      "Informe um nome de até 100 caracteres e confira os campos da criatura.",
    );
  }
  res.locals.creatureInput = result.data;
  next();
}

function handleCreatureError(error, _req, res, next) {
  if (
    error.code === "23503" &&
    error.constraint === "creatures_story_race_fkey"
  ) {
    return sendError(
      res,
      404,
      "RACE_NOT_FOUND",
      "Raça não encontrada nesta história.",
    );
  }
  if (error.type === "entity.parse.failed") {
    return sendError(res, 400, "INVALID_JSON", "Envie um JSON válido.");
  }
  if (error.type === "entity.too.large") {
    return sendError(
      res,
      413,
      "PAYLOAD_TOO_LARGE",
      "Os dados da criatura excedem o limite permitido.",
    );
  }
  next(error);
}
