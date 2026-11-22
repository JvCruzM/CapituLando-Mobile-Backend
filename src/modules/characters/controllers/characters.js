import { createCharacterRepository } from "../repositories/characters.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const characterNotFound = (res) =>
  sendSecurityError(
    res,
    404,
    "CHARACTER_NOT_FOUND",
    "Personagem não encontrado.",
  );

export function createCharacterController() {
  return {
    async list(req, res) {
      const repository = createCharacterRepository(req.app.locals.db);
      const characters = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (characters === null) return storyNotFound(res);
      res.json(characters);
    },

    async find(req, res) {
      const { storyId, characterId } = req.params;
      const repository = createCharacterRepository(req.app.locals.db);
      const character = await repository.find(
        storyId,
        res.locals.principal.id,
        characterId,
      );
      if (!character) return characterNotFound(res);
      res.json(character);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const repository = createCharacterRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const raceId = res.locals.characterInput.raceId;
      if (raceId && !(await repository.raceBelongsToStory(storyId, raceId))) {
        return sendSecurityError(
          res,
          400,
          "INVALID_RACE",
          "A raça informada não pertence a esta história.",
        );
      }

      const character = await repository.create(
        storyId,
        profileId,
        res.locals.characterInput,
      );
      if (!character) return storyNotFound(res);
      res.status(201).json(character);
    },

    async update(req, res) {
      const { storyId, characterId } = req.params;
      const profileId = res.locals.principal.id;
      const repository = createCharacterRepository(req.app.locals.db);

      const raceId = res.locals.characterInput.raceId;
      if (raceId && !(await repository.raceBelongsToStory(storyId, raceId))) {
        return sendSecurityError(
          res,
          400,
          "INVALID_RACE",
          "A raça informada não pertence a esta história.",
        );
      }

      const character = await repository.update(
        storyId,
        profileId,
        characterId,
        res.locals.characterInput,
      );
      if (!character) return characterNotFound(res);
      res.json(character);
    },

    async remove(req, res) {
      const { storyId, characterId } = req.params;
      const repository = createCharacterRepository(req.app.locals.db);
      try {
        const removed = await repository.remove(
          storyId,
          res.locals.principal.id,
          characterId,
        );
        if (!removed) return characterNotFound(res);
        res.status(204).end();
      } catch (error) {
        if (error.code !== "23503") throw error;
        sendSecurityError(
          res,
          409,
          "CHARACTER_IN_USE",
          "Remova os vínculos deste personagem antes de excluí-lo.",
        );
      }
    },
  };
}
