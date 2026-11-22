import { createEventCharacterRepository } from "../repositories/event-characters.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const participantNotFound = (res) =>
  sendSecurityError(
    res,
    404,
    "EVENT_CHARACTER_NOT_FOUND",
    "Participação no evento não encontrada.",
  );

export function createEventCharacterController() {
  return {
    async list(req, res) {
      const { storyId } = req.params;
      const eventId = req.query.eventId ? String(req.query.eventId) : null;
      const repository = createEventCharacterRepository(req.app.locals.db);
      const participants = await repository.list(
        storyId,
        res.locals.principal.id,
        eventId,
      );
      if (participants === null) return storyNotFound(res);
      res.json(participants);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const input = res.locals.eventCharacterInput;
      const repository = createEventCharacterRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const check = await repository.eventAndCharacterBelongToStory(
        storyId,
        input.eventId,
        input.characterId,
      );
      if (!check?.hasEvent || !check?.hasCharacter) {
        return sendSecurityError(
          res,
          400,
          "INVALID_EVENT_CHARACTER_LINK",
          "Evento e personagem devem pertencer a esta história.",
        );
      }

      try {
        const created = await repository.create(storyId, profileId, input);
        if (!created) return storyNotFound(res);
        res.status(201).json(created);
      } catch (error) {
        if (error.code !== "23505") throw error;
        sendSecurityError(
          res,
          409,
          "EVENT_CHARACTER_EXISTS",
          "Este personagem já está vinculado a este evento.",
        );
      }
    },

    async remove(req, res) {
      const { storyId, linkId } = req.params;
      const repository = createEventCharacterRepository(req.app.locals.db);
      const removed = await repository.remove(
        storyId,
        res.locals.principal.id,
        linkId,
      );
      if (!removed) return participantNotFound(res);
      res.status(204).end();
    },
  };
}
