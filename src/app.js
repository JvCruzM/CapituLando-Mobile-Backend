import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAuthRouter } from "./modules/auth/index.js";
import { createSessionRouter } from "./modules/sessions/index.js";
import { createProfileRouter } from "./modules/profile/index.js";
import { authenticate as authenticateSession } from "./shared/middlewares/auth.js";
import { errorHandler } from "./shared/middlewares/error-handler.js";
import { createBackupRouter } from "./modules/backups/index.js";
import { createCreatureRouter } from "./modules/creatures/index.js";
import { createItemRouter } from "./modules/items/index.js";
import { createRaceRouter } from "./modules/races/index.js";
import { createUniverseRouter } from "./modules/universe/index.js";
import { createWritingRouter } from "./modules/writing/index.js";

export function createApp(
  origins,
  { authenticate = authenticateSession, config, mailer, pool } = {},
) {
  const app = express();
  app.locals.config = config;
  app.locals.mailer = mailer;
  app.locals.pool = pool;
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.use("/api/universe", createUniverseRouter(authenticate));
  app.use("/api/stories/:storyId/races", createRaceRouter(authenticate));
  app.use(
    "/api/stories/:storyId/creatures",
    createCreatureRouter(authenticate),
  );
  app.use("/api/stories/:storyId/items", createItemRouter(authenticate));
  app.use("/api/writing", createWritingRouter(authenticate));
  app.use("/api/backup", createBackupRouter(authenticate));
  app.use("/api/profile", createProfileRouter());
  app.use("/api/auth", createAuthRouter());
  app.use("/api/sessions", createSessionRouter());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "capitulando-mobile-api" });
  });

  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } }),
  );
  app.use(errorHandler);
  return app;
}
