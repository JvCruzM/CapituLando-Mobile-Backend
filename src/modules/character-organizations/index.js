import { Router } from "express";
import { z } from "zod";
import { createCharacterOrganizationController } from "./controllers/character-organizations.js";
import {
  createCharacterOrganizationSchema,
  updateCharacterOrganizationSchema,
} from "./schemas/character-organization.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

const uuidSchema = z.string().uuid();

export function createCharacterOrganizationRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createCharacterOrganizationController();

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
      "Identificador de vínculo inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "256kb",
    "Os dados do vínculo excedem o limite permitido.",
  );

  router.get("/", validateOptionalCharacterQuery, controller.list);
  router.post("/", ...jsonBody, validateCreate, controller.create);
  router.put("/:linkId", ...jsonBody, validateUpdate, controller.update);
  router.delete("/:linkId", controller.remove);

  return router;
}

function validateOptionalCharacterQuery(req, res, next) {
  if (req.query.characterId && !uuidSchema.safeParse(req.query.characterId).success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_CHARACTER_ID",
      "Identificador de personagem inválido.",
    );
  }
  return next();
}

function validateCreate(req, res, next) {
  const result = createCharacterOrganizationSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_CHARACTER_ORGANIZATION",
      "Informe personagem, organização e confira os dados do vínculo.",
    );
  }
  res.locals.characterOrganizationInput = result.data;
  return next();
}

function validateUpdate(req, res, next) {
  const result = updateCharacterOrganizationSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_CHARACTER_ORGANIZATION",
      "Confira os campos do vínculo com a organização.",
    );
  }
  res.locals.characterOrganizationUpdateInput = result.data;
  return next();
}
