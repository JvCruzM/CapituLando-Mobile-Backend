import { Router } from "express";
import { createCharacterRelationshipController } from "./controllers/character-relationships.js";
import { characterRelationshipSchema } from "./schemas/character-relationship.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

export function createCharacterRelationshipRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createCharacterRelationshipController();

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
    "relationshipId",
    validateUuidParam(
      "relationshipId",
      "INVALID_RELATIONSHIP_ID",
      "Identificador de relacionamento inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "256kb",
    "Os dados de relacionamento excedem o limite permitido.",
  );

  router.get("/", controller.list);
  router.post("/", ...jsonBody, validateRelationship, controller.create);
  router.put(
    "/:relationshipId",
    ...jsonBody,
    validateRelationship,
    controller.update,
  );
  router.delete("/:relationshipId", controller.remove);

  return router;
}

function validateRelationship(req, res, next) {
  const result = characterRelationshipSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_RELATIONSHIP",
      "Selecione dois personagens diferentes, um tipo de relacionamento válido e confira os dados.",
    );
  }
  res.locals.relationshipInput = result.data;
  return next();
}
