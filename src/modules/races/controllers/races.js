import { createRaceRepository } from "../repositories/races.js";

const storyNotFound = (res) =>
  sendError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const raceNotFound = (res) =>
  sendError(res, 404, "RACE_NOT_FOUND", "Raça não encontrada.");

export function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export function createRaceController() {
  return {
    async list(req, res) {
      const repository = createRaceRepository(req.app.locals.db);
      const races = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (races === null) return storyNotFound(res);
      res.json(races);
    },

    async find(req, res) {
      const { storyId, raceId } = req.params;
      const repository = createRaceRepository(req.app.locals.db);
      const race = await repository.find(
        storyId,
        res.locals.principal.id,
        raceId,
      );
      if (!race) return raceNotFound(res);
      res.json(race);
    },

    async create(req, res) {
      const repository = createRaceRepository(req.app.locals.db);
      const race = await repository.create(
        req.params.storyId,
        res.locals.principal.id,
        res.locals.raceInput,
      );
      if (!race) return storyNotFound(res);
      res.status(201).json(race);
    },

    async update(req, res) {
      const { storyId, raceId } = req.params;
      const repository = createRaceRepository(req.app.locals.db);
      const race = await repository.update(
        storyId,
        res.locals.principal.id,
        raceId,
        res.locals.raceInput,
      );
      if (!race) return raceNotFound(res);
      res.json(race);
    },

    async remove(req, res) {
      const { storyId, raceId } = req.params;
      const repository = createRaceRepository(req.app.locals.db);
      try {
        const removed = await repository.remove(
          storyId,
          res.locals.principal.id,
          raceId,
        );
        if (!removed) return raceNotFound(res);
        res.status(204).end();
      } catch (error) {
        if (error.code !== "23503") throw error;
        sendError(
          res,
          409,
          "RACE_IN_USE",
          "Remova os vínculos desta raça antes de excluí-la.",
        );
      }
    },
  };
}
