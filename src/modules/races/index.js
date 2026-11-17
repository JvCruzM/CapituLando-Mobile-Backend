import express, { Router } from "express";
import { createRaceController, sendError } from "./controllers/races.js";
import { idSchema, raceSchema } from "./schemas/race.js";

export function createRaceRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createRaceController();

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

  router.param("raceId", (_req, res, next, raceId) => {
    if (!idSchema.safeParse(raceId).success) {
      return sendError(
        res,
        400,
        "INVALID_RACE_ID",
        "Identificador da raça inválido.",
      );
    }
    next();
  });

  const json = express.json();
  router.get("/", controller.list);
  router.get("/:raceId", controller.find);
  router.post("/", json, validateRace, controller.create);
  router.put("/:raceId", json, validateRace, controller.update);
  router.delete("/:raceId", controller.remove);
  router.use((error, _req, res, next) => {
    if (error.type === "entity.parse.failed") {
      return sendError(res, 400, "INVALID_JSON", "Envie um JSON válido.");
    }
    if (error.type === "entity.too.large") {
      return sendError(
        res,
        413,
        "PAYLOAD_TOO_LARGE",
        "Os dados da raça excedem o limite permitido.",
      );
    }
    next(error);
  });
  return router;
}

function validateRace(req, res, next) {
  const result = raceSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(
      res,
      400,
      "INVALID_RACE",
      "Informe um nome de até 100 caracteres e confira os campos da raça.",
    );
  }
  res.locals.raceInput = result.data;
  next();
}
