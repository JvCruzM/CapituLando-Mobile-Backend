import { createLocationRepository } from "../repositories/locations.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const locationNotFound = (res) =>
  sendSecurityError(res, 404, "LOCATION_NOT_FOUND", "Local não encontrado.");

async function validateParentLocation(repository, storyId, locationId, parentLocationId, res) {
  if (!parentLocationId) return true;
  if (locationId && parentLocationId === locationId) {
    sendSecurityError(
      res,
      400,
      "INVALID_PARENT_LOCATION",
      "Um local não pode pertencer a si mesmo.",
    );
    return false;
  }

  const visited = new Set(locationId ? [locationId] : []);
  let currentId = parentLocationId;

  while (currentId) {
    if (visited.has(currentId)) {
      sendSecurityError(
        res,
        400,
        "INVALID_PARENT_LOCATION",
        "Um local não pode pertencer a um de seus próprios sublocais.",
      );
      return false;
    }
    visited.add(currentId);
    const parent = await repository.findParentInStory(storyId, currentId);
    if (!parent) {
      sendSecurityError(
        res,
        400,
        "INVALID_PARENT_LOCATION",
        "O local pai informado não pertence a esta história.",
      );
      return false;
    }
    currentId = parent.parentLocationId;
  }

  return true;
}

export function createLocationController() {
  return {
    async list(req, res) {
      const repository = createLocationRepository(req.app.locals.db);
      const locations = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (locations === null) return storyNotFound(res);
      res.json(locations);
    },

    async find(req, res) {
      const { storyId, locationId } = req.params;
      const repository = createLocationRepository(req.app.locals.db);
      const location = await repository.find(
        storyId,
        res.locals.principal.id,
        locationId,
      );
      if (!location) return locationNotFound(res);
      res.json(location);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const repository = createLocationRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const validParent = await validateParentLocation(
        repository,
        storyId,
        null,
        res.locals.locationInput.parentLocationId,
        res,
      );
      if (!validParent) return;

      const location = await repository.create(
        storyId,
        profileId,
        res.locals.locationInput,
      );
      if (!location) return storyNotFound(res);
      res.status(201).json(location);
    },

    async update(req, res) {
      const { storyId, locationId } = req.params;
      const profileId = res.locals.principal.id;
      const repository = createLocationRepository(req.app.locals.db);

      const validParent = await validateParentLocation(
        repository,
        storyId,
        locationId,
        res.locals.locationInput.parentLocationId,
        res,
      );
      if (!validParent) return;

      const location = await repository.update(
        storyId,
        profileId,
        locationId,
        res.locals.locationInput,
      );
      if (!location) return locationNotFound(res);
      res.json(location);
    },

    async remove(req, res) {
      const { storyId, locationId } = req.params;
      const repository = createLocationRepository(req.app.locals.db);
      try {
        const removed = await repository.remove(
          storyId,
          res.locals.principal.id,
          locationId,
        );
        if (!removed) return locationNotFound(res);
        res.status(204).end();
      } catch (error) {
        if (error.code !== "23503") throw error;
        sendSecurityError(
          res,
          409,
          "LOCATION_IN_USE",
          "Remova os vínculos deste local antes de excluí-lo.",
        );
      }
    },
  };
}
