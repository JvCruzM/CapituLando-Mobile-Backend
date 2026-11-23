import { transaction } from "../../../database/transaction.js";
import { AppError } from "../../../shared/errors/app-error.js";
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

    create: saveEvent(false),
    update: saveEvent(true),

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

function saveEvent(update) {
  return async (req, res) => {
    const input = res.locals.eventInput,
      owner = res.locals.principal.id,
      story = req.params.storyId;
    const saved = await transaction(req.app.locals.db, async (db) => {
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
      const repository = createEventRepository(db);
      if (!(await repository.storyExists(story, owner)))
        throw new AppError(404, "STORY_NOT_FOUND", "História não encontrada.");
      const refs = await repository.referencesBelongToStory(
        story,
        input.chapterId,
        input.locationId,
      );
      if (!refs.validChapter || !refs.validLocation)
        throw new AppError(
          400,
          "INVALID_REFERENCE",
          "Capítulo ou local não pertence à história.",
        );
      if (input.characterIds) {
        const { rows } = await db.query(
          "SELECT id FROM characters WHERE story_id=$1 AND id=ANY($2::uuid[])",
          [story, input.characterIds],
        );
        if (rows.length !== input.characterIds.length)
          throw new AppError(
            400,
            "INVALID_CHARACTERS",
            "Selecione personagens da história.",
          );
      }
      const event = update
        ? await repository.update(story, owner, req.params.eventId, input)
        : await repository.create(story, owner, input);
      if (!event)
        throw new AppError(404, "EVENT_NOT_FOUND", "Evento não encontrado.");
      if (input.characterIds) {
        await db.query(
          "DELETE FROM event_characters WHERE story_id=$1 AND event_id=$2",
          [story, event.id],
        );
        for (const id of input.characterIds)
          await db.query(
            "INSERT INTO event_characters(story_id,event_id,character_id) VALUES($1,$2,$3)",
            [story, event.id, id],
          );
      }
      return event;
    });
    res.status(update ? 200 : 201).json(saved);
  };
}
