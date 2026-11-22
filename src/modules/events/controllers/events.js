import { createEventRepository } from "../repositories/events.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const eventNotFound = (res) =>
  sendSecurityError(res, 404, "EVENT_NOT_FOUND", "Evento não encontrado.");

export function createEventController() {
  return {
    async list(req, res) {
      const repository = createEventRepository(req.app.locals.db);
      const events = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (events === null) return storyNotFound(res);
      res.json(events);
    },

    async find(req, res) {
      const { storyId, eventId } = req.params;
      const repository = createEventRepository(req.app.locals.db);
      const event = await repository.find(
        storyId,
        res.locals.principal.id,
        eventId,
      );
      if (!event) return eventNotFound(res);
      res.json(event);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const input = res.locals.eventInput;
      const repository = createEventRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const refs = await repository.referencesBelongToStory(
        storyId,
        input.chapterId,
        input.locationId,
      );
      if (!refs?.validChapter) {
        return sendSecurityError(
          res,
          400,
          "INVALID_CHAPTER",
          "O capítulo informado não pertence a esta história.",
        );
      }
      if (!refs?.validLocation) {
        return sendSecurityError(
          res,
          400,
          "INVALID_LOCATION",
          "O local informado não pertence a esta história.",
        );
      }

      const created = await repository.create(storyId, profileId, input);
      if (!created) return storyNotFound(res);
      res.status(201).json(created);
    },

    async update(req, res) {
      const { storyId, eventId } = req.params;
      const profileId = res.locals.principal.id;
      const input = res.locals.eventInput;
      const repository = createEventRepository(req.app.locals.db);

      const refs = await repository.referencesBelongToStory(
        storyId,
        input.chapterId,
        input.locationId,
      );
      if (!refs?.validChapter) {
        return sendSecurityError(
          res,
          400,
          "INVALID_CHAPTER",
          "O capítulo informado não pertence a esta história.",
        );
      }
      if (!refs?.validLocation) {
        return sendSecurityError(
          res,
          400,
          "INVALID_LOCATION",
          "O local informado não pertence a esta história.",
        );
      }

      const updated = await repository.update(
        storyId,
        profileId,
        eventId,
        input,
      );
      if (!updated) return eventNotFound(res);
      res.json(updated);
    },

    async remove(req, res) {
      const { storyId, eventId } = req.params;
      const repository = createEventRepository(req.app.locals.db);
      try {
        const removed = await repository.remove(
          storyId,
          res.locals.principal.id,
          eventId,
        );
        if (!removed) return eventNotFound(res);
        res.status(204).end();
      } catch (error) {
        if (error.code !== "23503") throw error;
        sendSecurityError(
          res,
          409,
          "EVENT_IN_USE",
          "Remova os participantes deste evento antes de excluí-lo.",
        );
      }
    },
  };
}
