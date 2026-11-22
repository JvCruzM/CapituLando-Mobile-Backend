import { Router } from "express";
import { createWorldRuleController } from "./controllers/world-rules.js";
import { worldRuleSchema } from "./schemas/world-rule.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

export function createWorldRuleRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createWorldRuleController();

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
    "ruleId",
    validateUuidParam(
      "ruleId",
      "INVALID_WORLD_RULE_ID",
      "Identificador de regra do universo inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "1mb",
    "Os dados da regra do universo excedem o limite permitido.",
  );

  router.get("/", controller.list);
  router.get("/:ruleId", controller.find);
  router.post("/", ...jsonBody, validateWorldRule, controller.create);
  router.put("/:ruleId", ...jsonBody, validateWorldRule, controller.update);
  router.delete("/:ruleId", controller.remove);

  return router;
}

function validateWorldRule(req, res, next) {
  const result = worldRuleSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_WORLD_RULE",
      "Informe um título de até 150 caracteres e confira os campos da regra.",
    );
  }
  res.locals.worldRuleInput = result.data;
  return next();
}
