import { Router } from "express";
import { z } from "zod";
import { createEventCharacterController } from "./controllers/event-characters.js";
import { createEventCharacterSchema } from "./schemas/event-character.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

const uuidSchema = z.string().uuid();

export function createEventCharacterRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createEventCharacterController();

  if (authenticate) router.use(authenticate);
  router.use(requireValidPrincipal);
  router.use((req, res, next) =>
    validateUuidParam(
      "storyId",
      "INVALID_STORY_ID",
      "Identificador de história inválido.",
    )(req, res, next, req.params.storyId),
  );
  router.param(
    "linkId",
    validateUuidParam(
      "linkId",
      "INVALID_LINK_ID",
      "Identificador de participante inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "256kb",
    "Os dados do participante excedem o limite permitido.",
  );

  router.get("/", validateOptionalEventQuery, controller.list);
  router.post("/", ...jsonBody, validateCreate, controller.create);
  router.delete("/:linkId", controller.remove);

  return router;
}

function validateOptionalEventQuery(req, res, next) {
  if (req.query.eventId && !uuidSchema.safeParse(req.query.eventId).success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_EVENT_ID",
      "Identificador de evento inválido.",
    );
  }
  return next();
}

function validateCreate(req, res, next) {
  const result = createEventCharacterSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_EVENT_CHARACTER",
      "Informe identificadores válidos de evento e personagem.",
    );
  }
  res.locals.eventCharacterInput = result.data;
  return next();
}
