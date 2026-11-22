import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAuthRouter } from "./modules/auth/index.js";
import { createSessionRouter } from "./modules/sessions/index.js";
import { createProfileRouter } from "./modules/profile/index.js";
import { authenticate as authenticateSession } from "./shared/middlewares/auth.js";
import { errorHandler } from "./shared/middlewares/error-handler.js";
import {
  apiSecurityHeaders,
  createWriteRateLimiter,
} from "./shared/middlewares/security.js";
import { createBackupRouter } from "./modules/backups/index.js";
import { createCreatureRouter } from "./modules/creatures/index.js";
import { createItemRouter } from "./modules/items/index.js";
import { createRaceRouter } from "./modules/races/index.js";
import { createUniverseRouter } from "./modules/universe/index.js";
import { createCharacterRouter } from "./modules/characters/index.js";
import { createCharacterOrganizationRouter } from "./modules/character-organizations/index.js";
import { createCharacterRelationshipRouter } from "./modules/character-relationships/index.js";
import { createLocationRouter } from "./modules/locations/index.js";
import { createOrganizationRouter } from "./modules/organizations/index.js";
import { createWorldRuleRouter } from "./modules/world-rules/index.js";
import { createEventRouter } from "./modules/events/index.js";
import { createEventCharacterRouter } from "./modules/event-characters/index.js";

export function createApp(
  origins,
  { authenticate = authenticateSession, config, mailer } = {},
) {
  const app = express();
  app.locals.config = config;
  app.locals.mailer = mailer;
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(apiSecurityHeaders);
  app.use(cors({ origin: origins }));
  app.use("/api", createWriteRateLimiter());

  app.use("/api/universe", createUniverseRouter(authenticate));
  app.use("/api/stories/:storyId/races", createRaceRouter(authenticate));
  app.use(
    "/api/stories/:storyId/creatures",
    createCreatureRouter(authenticate),
  );
  app.use("/api/stories/:storyId/items", createItemRouter(authenticate));

  // Rotas do módulo Márcio
  app.use(
    "/api/stories/:storyId/characters",
    createCharacterRouter(authenticate),
  );
  app.use(
    "/api/stories/:storyId/character-organizations",
    createCharacterOrganizationRouter(authenticate),
  );
  app.use(
    "/api/stories/:storyId/character-relationships",
    createCharacterRelationshipRouter(authenticate),
  );
  app.use(
    "/api/stories/:storyId/locations",
    createLocationRouter(authenticate),
  );
  app.use(
    "/api/stories/:storyId/organizations",
    createOrganizationRouter(authenticate),
  );
  app.use(
    "/api/stories/:storyId/world-rules",
    createWorldRuleRouter(authenticate),
  );
  app.use("/api/stories/:storyId/events", createEventRouter(authenticate));
  app.use(
    "/api/stories/:storyId/event-characters",
    createEventCharacterRouter(authenticate),
  );

  app.use("/api/backup", createBackupRouter(authenticate));
  app.use("/api/profile", createProfileRouter());
  app.use(express.json());
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
