import { createItemRepository } from "../repositories/items.js";

export function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function storyNotFound(res) {
  return sendError(res, 404, "STORY_NOT_FOUND", "História não encontrada.");
}

function itemNotFound(res) {
  return sendError(res, 404, "ITEM_NOT_FOUND", "Item não encontrado.");
}

export async function listItems(req, res) {
  const repository = createItemRepository(req.app.locals.db);
  const items = await repository.list(
    req.params.storyId,
    res.locals.principal.id,
  );
  if (items === null) return storyNotFound(res);
  res.json(items);
}

export async function findItem(req, res) {
  const { storyId, itemId } = req.params;
  const repository = createItemRepository(req.app.locals.db);
  const item = await repository.find(storyId, res.locals.principal.id, itemId);
  if (!item) return itemNotFound(res);
  res.json(item);
}

export async function createItem(req, res) {
  const repository = createItemRepository(req.app.locals.db);
  const item = await repository.create(
    req.params.storyId,
    res.locals.principal.id,
    res.locals.itemInput,
  );
  if (!item) return storyNotFound(res);
  res.status(201).json(item);
}

export async function updateItem(req, res) {
  const { storyId, itemId } = req.params;
  const repository = createItemRepository(req.app.locals.db);
  const item = await repository.update(
    storyId,
    res.locals.principal.id,
    itemId,
    res.locals.itemInput,
  );
  if (!item) return itemNotFound(res);
  res.json(item);
}

export async function deleteItem(req, res) {
  const { storyId, itemId } = req.params;
  const repository = createItemRepository(req.app.locals.db);
  const removed = await repository.remove(
    storyId,
    res.locals.principal.id,
    itemId,
  );
  if (!removed) return itemNotFound(res);
  res.status(204).end();
}
