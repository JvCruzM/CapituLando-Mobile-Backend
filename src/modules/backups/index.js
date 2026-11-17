import express, { Router } from "express";
import { z } from "zod";
import { clearBackup } from "./controllers/clear-backup.js";
import { downloadBackup } from "./controllers/export-backup.js";
import { uploadBackup } from "./controllers/restore-backup.js";
import { BackupError } from "./schemas/backup-error.js";

const profileId = z.guid();

export function createBackupRouter(authenticate) {
  const router = Router();
  if (authenticate) router.use(authenticate);

  router.use((_req, res, next) => {
    if (!profileId.safeParse(res.locals.principal?.id).success) {
      return next(
        new BackupError(
          401,
          "UNAUTHORIZED",
          "Entre na sua conta para continuar.",
        ),
      );
    }
    next();
  });
  router.get("/", downloadBackup);
  router.post("/", express.json({ limit: "25mb" }), uploadBackup);
  router.delete("/", clearBackup);
  router.use(handleBackupError);

  return router;
}

function handleBackupError(error, _req, res, next) {
  if (error instanceof BackupError) {
    return res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Envie um JSON válido." },
    });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "O backup excede 25 MB." },
    });
  }
  next(error);
}
