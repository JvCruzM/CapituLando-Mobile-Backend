import { createWorldRuleRepository } from "../repositories/world-rules.js";
import { sendSecurityError } from "../../../shared/middlewares/security.js";

const storyNotFound = (res) =>
  sendSecurityError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
const ruleNotFound = (res) =>
  sendSecurityError(
    res,
    404,
    "WORLD_RULE_NOT_FOUND",
    "Regra do universo não encontrada.",
  );

export function createWorldRuleController() {
  return {
    async list(req, res) {
      const repository = createWorldRuleRepository(req.app.locals.db);
      const rules = await repository.list(
        req.params.storyId,
        res.locals.principal.id,
      );
      if (rules === null) return storyNotFound(res);
      res.json(rules);
    },

    async find(req, res) {
      const { storyId, ruleId } = req.params;
      const repository = createWorldRuleRepository(req.app.locals.db);
      const rule = await repository.find(
        storyId,
        res.locals.principal.id,
        ruleId,
      );
      if (!rule) return ruleNotFound(res);
      res.json(rule);
    },

    async create(req, res) {
      const repository = createWorldRuleRepository(req.app.locals.db);
      const rule = await repository.create(
        req.params.storyId,
        res.locals.principal.id,
        res.locals.worldRuleInput,
      );
      if (!rule) return storyNotFound(res);
      res.status(201).json(rule);
    },

    async update(req, res) {
      const { storyId, ruleId } = req.params;
      const repository = createWorldRuleRepository(req.app.locals.db);
      const rule = await repository.update(
        storyId,
        res.locals.principal.id,
        ruleId,
        res.locals.worldRuleInput,
      );
      if (!rule) return ruleNotFound(res);
      res.json(rule);
    },

    async remove(req, res) {
      const { storyId, ruleId } = req.params;
      const repository = createWorldRuleRepository(req.app.locals.db);
      const removed = await repository.remove(
        storyId,
        res.locals.principal.id,
        ruleId,
      );
      if (!removed) return ruleNotFound(res);
      res.status(204).end();
    },
  };
}
