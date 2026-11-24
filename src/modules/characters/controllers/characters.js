import { transaction } from "../../../database/transaction.js";
import { AppError } from "../../../shared/errors/app-error.js";
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

    create: saveCharacter(false),
    update: saveCharacter(true),

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

function saveCharacter(update) {
  return async (req, res) => {
    const owner = res.locals.principal.id,
      story = req.params.storyId,
      input = res.locals.characterInput;
    const saved = await transaction(req.app.locals.db, async (db) => {
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
      const repository = createCharacterRepository(db);
      if (!(await repository.storyExists(story, owner)))
        throw new AppError(404, "STORY_NOT_FOUND", "História não encontrada.");
      if (
        input.raceId &&
        !(await repository.raceBelongsToStory(story, input.raceId))
      )
        throw new AppError(
          400,
          "INVALID_RACE",
          "Selecione uma raça da história.",
        );
      if (input.organizationId) {
        const { rows } = await db.query(
          "SELECT id FROM organizations WHERE id=$1 AND story_id=$2",
          [input.organizationId, story],
        );
        if (!rows.length)
          throw new AppError(
            400,
            "INVALID_ORGANIZATION",
            "Selecione uma organização da história.",
          );
      }
      if (input.organizationIds?.length) {
        const { rows } = await db.query(
          "SELECT id FROM organizations WHERE story_id=$1 AND id=ANY($2::uuid[])",
          [story, input.organizationIds],
        );
        if (rows.length !== input.organizationIds.length)
          throw new AppError(
            400,
            "INVALID_ORGANIZATION",
            "Selecione organizações desta história.",
          );
      }
      const character = update
        ? await repository.update(story, owner, req.params.characterId, input)
        : await repository.create(story, owner, input);
      if (!character)
        throw new AppError(
          404,
          "CHARACTER_NOT_FOUND",
          "Personagem não encontrado.",
        );
      if (input.organizationId)
        await db.query(
          "INSERT INTO character_organizations(story_id,character_id,organization_id,is_active) VALUES($1,$2,$3,true) ON CONFLICT(character_id,organization_id) DO UPDATE SET is_active=true,updated_at=now()",
          [story, character.id, input.organizationId],
        );
      if (input.organizationIds) {
        await db.query(
          "UPDATE character_organizations SET is_active=false,updated_at=now() WHERE story_id=$1 AND character_id=$2 AND is_active AND NOT(organization_id=ANY($3::uuid[]))",
          [story, character.id, input.organizationIds],
        );
        for (const org of input.organizationIds)
          await db.query(
            "INSERT INTO character_organizations(story_id,character_id,organization_id,is_active) VALUES($1,$2,$3,true) ON CONFLICT(character_id,organization_id) DO UPDATE SET is_active=true,updated_at=now()",
            [story, character.id, org],
          );
      }
      return character;
    });
    res.status(update ? 200 : 201).json(saved);
  };
}
