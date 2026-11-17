import { createCreatureRepository } from "../repositories/creatures.js";

export function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function storyNotFound(res) {
  return sendError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
}

function creatureNotFound(res) {
  return sendError(res, 404, "CREATURE_NOT_FOUND", "Criatura não encontrada.");
}

export async function listCreatures(req, res) {
  const repository = createCreatureRepository(req.app.locals.db);
  const creatures = await repository.list(
    req.params.storyId,
    res.locals.principal.id,
  );
  if (creatures === null) return storyNotFound(res);
  res.json(creatures);
}

export async function findCreature(req, res) {
  const { storyId, creatureId } = req.params;
  const repository = createCreatureRepository(req.app.locals.db);
  const creature = await repository.find(
    storyId,
    res.locals.principal.id,
    creatureId,
  );
  if (!creature) return creatureNotFound(res);
  res.json(creature);
}

export async function createCreature(req, res) {
  const repository = createCreatureRepository(req.app.locals.db);
  const creature = await repository.create(
    req.params.storyId,
    res.locals.principal.id,
    res.locals.creatureInput,
  );
  if (!creature) return storyNotFound(res);
  res.status(201).json(creature);
}

export async function updateCreature(req, res) {
  const { storyId, creatureId } = req.params;
  const repository = createCreatureRepository(req.app.locals.db);
  const creature = await repository.update(
    storyId,
    res.locals.principal.id,
    creatureId,
    res.locals.creatureInput,
  );
  if (!creature) return creatureNotFound(res);
  res.json(creature);
}

export async function deleteCreature(req, res) {
  const { storyId, creatureId } = req.params;
  const repository = createCreatureRepository(req.app.locals.db);
  const removed = await repository.remove(
    storyId,
    res.locals.principal.id,
    creatureId,
  );
  if (!removed) return creatureNotFound(res);
  res.status(204).end();
}
