import { createCharacterOrganizationRepository } from "../repositories/character-organizations.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const linkNotFound = (res) =>
  sendSecurityError(
    res,
    404,
    "CHARACTER_ORGANIZATION_NOT_FOUND",
    "Vínculo com organização não encontrado.",
  );

export function createCharacterOrganizationController() {
  return {
    async list(req, res) {
      const { storyId } = req.params;
      const characterId = req.query.characterId ? String(req.query.characterId) : null;
      const repository = createCharacterOrganizationRepository(req.app.locals.db);
      const links = await repository.list(
        storyId,
        res.locals.principal.id,
        characterId,
      );
      if (links === null) return storyNotFound(res);
      res.json(links);
    },

    async create(req, res) {
      const { storyId } = req.params;
      const profileId = res.locals.principal.id;
      const input = res.locals.characterOrganizationInput;
      const repository = createCharacterOrganizationRepository(req.app.locals.db);

      if (!(await repository.storyExists(storyId, profileId))) {
        return storyNotFound(res);
      }

      const check = await repository.characterAndOrganizationBelongToStory(
        storyId,
        input.characterId,
        input.organizationId,
      );
      if (!check?.hasCharacter || !check?.hasOrganization) {
        return sendSecurityError(
          res,
          400,
          "INVALID_CHARACTER_ORGANIZATION_LINK",
          "Personagem e organização devem pertencer a esta história.",
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
          "CHARACTER_ORGANIZATION_EXISTS",
          "Este personagem já está vinculado a esta organização.",
        );
      }
    },

    async update(req, res) {
      const { storyId, linkId } = req.params;
      const repository = createCharacterOrganizationRepository(req.app.locals.db);
      const updated = await repository.update(
        storyId,
        res.locals.principal.id,
        linkId,
        res.locals.characterOrganizationUpdateInput,
      );
      if (!updated) return linkNotFound(res);
      res.json(updated);
    },

    async remove(req, res) {
      const { storyId, linkId } = req.params;
      const repository = createCharacterOrganizationRepository(req.app.locals.db);
      const removed = await repository.remove(
        storyId,
        res.locals.principal.id,
        linkId,
      );
      if (!removed) return linkNotFound(res);
      res.status(204).end();
    },
  };
}
