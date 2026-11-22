import { createCharacterRelationshipRepository } from "../repositories/character-relationships.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const relationshipNotFound = (res) =>
  sendSecurityError(
    res,
    404,
    "RELATIONSHIP_NOT_FOUND",
    "Relacionamento não encontrado.",
  );

export function createCharacterRelationshipController() {
  return {
    async list(req, res) {
      const repository = createCharacterRelationshipRepository(req.app.locals.db);
      const relationships = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (relationships === null) return storyNotFound(res);
      res.json(relationships);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const input = res.locals.relationshipInput;
      const repository = createCharacterRelationshipRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const check = await repository.charactersBelongToStory(
        storyId,
        input.sourceCharacterId,
        input.targetCharacterId,
      );
      if (!check?.hasSource || !check?.hasTarget) {
        return sendSecurityError(
          res,
          400,
          "INVALID_RELATIONSHIP_CHARACTERS",
          "Os personagens informados devem pertencer a esta história.",
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
          "RELATIONSHIP_EXISTS",
          "Já existe um relacionamento cadastrado entre esses personagens.",
        );
      }
    },

    async update(req, res) {
      const { storyId, relationshipId } = req.params;
      const profileId = res.locals.principal.id;
      const input = res.locals.relationshipInput;
      const repository = createCharacterRelationshipRepository(req.app.locals.db);

      const check = await repository.charactersBelongToStory(
        storyId,
        input.sourceCharacterId,
        input.targetCharacterId,
      );
      if (!check?.hasSource || !check?.hasTarget) {
        return sendSecurityError(
          res,
          400,
          "INVALID_RELATIONSHIP_CHARACTERS",
          "Os personagens informados devem pertencer a esta história.",
        );
      }

      try {
        const updated = await repository.update(
          storyId,
          profileId,
          relationshipId,
          input,
        );
        if (!updated) return relationshipNotFound(res);
        res.json(updated);
      } catch (error) {
        if (error.code !== "23505") throw error;
        sendSecurityError(
          res,
          409,
          "RELATIONSHIP_EXISTS",
          "Já existe um relacionamento cadastrado entre esses personagens.",
        );
      }
    },

    async remove(req, res) {
      const { storyId, relationshipId } = req.params;
      const repository = createCharacterRelationshipRepository(req.app.locals.db);
      const removed = await repository.remove(
        storyId,
        res.locals.principal.id,
        relationshipId,
      );
      if (!removed) return relationshipNotFound(res);
      res.status(204).end();
    },
  };
}
