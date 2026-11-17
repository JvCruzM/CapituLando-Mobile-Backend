import express, { Router } from "express";
import {
  createItem,
  deleteItem,
  findItem,
  listItems,
  sendError,
  updateItem,
} from "./controllers/items.js";
import { idSchema, itemSchema } from "./schemas/item.js";

export function createItemRouter(authenticate) {
  const router = Router({ mergeParams: true });
  if (authenticate) router.use(authenticate);

  router.use((req, res, next) => {
    if (!idSchema.safeParse(res.locals.principal?.id).success) {
      return sendError(
        res,
        401,
        "UNAUTHORIZED",
        "Entre na sua conta para continuar.",
      );
    }
    if (!idSchema.safeParse(req.params.storyId).success) {
      return sendError(
        res,
        400,
        "INVALID_STORY_ID",
        "Identificador da história inválido.",
      );
    }
    next();
  });

  router.param("itemId", (_req, res, next, itemId) => {
    if (!idSchema.safeParse(itemId).success) {
      return sendError(
        res,
        400,
        "INVALID_ITEM_ID",
        "Identificador do item inválido.",
      );
    }
    next();
  });

  const json = express.json();
  router.get("/", listItems);
  router.get("/:itemId", findItem);
  router.post("/", json, validateItem, createItem);
  router.put("/:itemId", json, validateItem, updateItem);
  router.delete("/:itemId", deleteItem);
  router.use(handleItemError);
  return router;
}

function validateItem(req, res, next) {
  const result = itemSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(
      res,
      400,
      "INVALID_ITEM",
      "Informe um nome de até 100 caracteres e, se houver, um tipo de até 50 caracteres.",
    );
  }
  res.locals.itemInput = result.data;
  next();
}

function handleItemError(error, _req, res, next) {
  if (error.type === "entity.parse.failed") {
    return sendError(res, 400, "INVALID_JSON", "Envie um JSON válido.");
  }
  if (error.type === "entity.too.large") {
    return sendError(
      res,
      413,
      "PAYLOAD_TOO_LARGE",
      "Os dados do item excedem o limite permitido.",
    );
  }
  next(error);
}
