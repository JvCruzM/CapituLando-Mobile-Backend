import { Router } from "express";
import { createEventController } from "./controllers/events.js";
import { eventSchema } from "./schemas/event.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

export function createEventRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createEventController();

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
    "eventId",
    validateUuidParam(
      "eventId",
      "INVALID_EVENT_ID",
      "Identificador de evento inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "1mb",
    "Os dados do evento excedem o limite permitido.",
  );

  router.get("/", controller.list);
  router.get("/:eventId", controller.find);
  router.post("/", ...jsonBody, validateEvent, controller.create);
  router.put("/:eventId", ...jsonBody, validateEvent, controller.update);
  router.delete("/:eventId", controller.remove);

  return router;
}

function validateEvent(req, res, next) {
  const result = eventSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_EVENT",
      "Informe um título de até 200 caracteres e confira os campos do evento.",
    );
  }
  res.locals.eventInput = result.data;
  return next();
}
