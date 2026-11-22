import { Router } from "express";
import { createOrganizationController } from "./controllers/organizations.js";
import { organizationSchema } from "./schemas/organization.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  sendSecurityError,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

export function createOrganizationRouter(authenticate) {
  const router = Router({ mergeParams: true });
  const controller = createOrganizationController();

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
    "organizationId",
    validateUuidParam(
      "organizationId",
      "INVALID_ORGANIZATION_ID",
      "Identificador de organização inválido.",
    ),
  );

  const jsonBody = createJsonBodyParser(
    "1mb",
    "Os dados de organização excedem o limite permitido.",
  );

  router.get("/", controller.list);
  router.get("/:organizationId", controller.find);
  router.post("/", ...jsonBody, validateOrganization, controller.create);
  router.put(
    "/:organizationId",
    ...jsonBody,
    validateOrganization,
    controller.update,
  );
  router.delete("/:organizationId", controller.remove);

  return router;
}

function validateOrganization(req, res, next) {
  const result = organizationSchema.safeParse(req.body);
  if (!result.success) {
    return sendSecurityError(
      res,
      400,
      "INVALID_ORGANIZATION",
      "Informe um nome de até 100 caracteres e confira os campos da organização.",
    );
  }
  res.locals.organizationInput = result.data;
  return next();
}
