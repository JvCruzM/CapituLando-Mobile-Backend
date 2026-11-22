import { Router } from "express";
import { createCharacterController } from "./controllers/characters.js";
import { characterSchema } from "./schemas/character.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

export function createCharacterRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createCharacterController();

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
    "characterId",
    validateUuidParam(
      "characterId",
      "INVALID_CHARACTER_ID",
      "Identificador de personagem inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "2mb",
    "Os dados de personagem excedem o limite permitido.",
  );

  router.get("/", controller.list);
  router.get("/:characterId", controller.find);
  router.post("/", ...jsonBody, validateCharacter, controller.create);
  router.put("/:characterId", ...jsonBody, validateCharacter, controller.update);
  router.delete("/:characterId", controller.remove);

  return router;
}

function validateCharacter(req, res, next) {
  const result = characterSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_CHARACTER",
      "Informe um nome de até 100 caracteres e confira os campos do personagem.",
    );
  }
  res.locals.characterInput = result.data;
  return next();
}
