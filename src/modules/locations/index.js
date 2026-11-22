import { Router } from "express";
import { createLocationController } from "./controllers/locations.js";
import { locationSchema } from "./schemas/location.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

export function createLocationRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createLocationController();

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
    "locationId",
    validateUuidParam(
      "locationId",
      "INVALID_LOCATION_ID",
      "Identificador de local inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "1mb",
    "Os dados de local excedem o limite permitido.",
  );

  router.get("/", controller.list);
  router.get("/:locationId", controller.find);
  router.post("/", ...jsonBody, validateLocation, controller.create);
  router.put("/:locationId", ...jsonBody, validateLocation, controller.update);
  router.delete("/:locationId", controller.remove);

  return router;
}

function validateLocation(req, res, next) {
  const result = locationSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_LOCATION",
      "Informe um nome de até 100 caracteres e confira os campos do local.",
    );
  }
  res.locals.locationInput = result.data;
  return next();
}
