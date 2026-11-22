import { createOrganizationRepository } from "../repositories/organizations.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const organizationNotFound = (res) =>
  sendSecurityError(
    res,
    404,
    "ORGANIZATION_NOT_FOUND",
    "Organização não encontrada.",
  );

export function createOrganizationController() {
  return {
    async list(req, res) {
      const repository = createOrganizationRepository(req.app.locals.db);
      const organizations = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (organizations === null) return storyNotFound(res);
      res.json(organizations);
    },

    async find(req, res) {
      const { storyId, organizationId } = req.params;
      const repository = createOrganizationRepository(req.app.locals.db);
      const organization = await repository.find(
        storyId,
        res.locals.principal.id,
        organizationId,
      );
      if (!organization) return organizationNotFound(res);
      res.json(organization);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const repository = createOrganizationRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const hqId = res.locals.organizationInput.headquartersLocationId;
      if (hqId && !(await repository.locationBelongsToStory(storyId, hqId))) {
        return sendSecurityError(
          res,
          400,
          "INVALID_HEADQUARTERS_LOCATION",
          "A sede informada não pertence a esta história.",
        );
      }

      const organization = await repository.create(
        storyId,
        profileId,
        res.locals.organizationInput,
      );
      if (!organization) return storyNotFound(res);
      res.status(201).json(organization);
    },

    async update(req, res) {
      const { storyId, organizationId } = req.params;
      const profileId = res.locals.principal.id;
      const repository = createOrganizationRepository(req.app.locals.db);

      const hqId = res.locals.organizationInput.headquartersLocationId;
      if (hqId && !(await repository.locationBelongsToStory(storyId, hqId))) {
        return sendSecurityError(
          res,
          400,
          "INVALID_HEADQUARTERS_LOCATION",
          "A sede informada não pertence a esta história.",
        );
      }

      const organization = await repository.update(
        storyId,
        profileId,
        organizationId,
        res.locals.organizationInput,
      );
      if (!organization) return organizationNotFound(res);
      res.json(organization);
    },

    async remove(req, res) {
      const { storyId, organizationId } = req.params;
      const repository = createOrganizationRepository(req.app.locals.db);
      try {
        const removed = await repository.remove(
          storyId,
          res.locals.principal.id,
          organizationId,
        );
        if (!removed) return organizationNotFound(res);
        res.status(204).end();
      } catch (error) {
        if (error.code !== "23503") throw error;
        sendSecurityError(
          res,
          409,
          "ORGANIZATION_IN_USE",
          "Remova os vínculos desta organização antes de excluí-la.",
        );
      }
    },
  };
}
