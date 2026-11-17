import { Router } from "express";
import { z } from "zod";
import { downloadBackup } from "./controllers/export-backup.js";

const profileId = z.guid();

export function createBackupRouter(authenticate) {
  const router = Router();
  if (authenticate) router.use(authenticate);

  router.get(
    "/",
    (_req, res, next) => {
      if (!profileId.safeParse(res.locals.principal?.id).success) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Entre na sua conta para continuar.",
          },
        });
      }
      next();
    },
    downloadBackup,
  );

  return router;
}
