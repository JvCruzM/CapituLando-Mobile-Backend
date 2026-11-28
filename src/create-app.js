import cors from "cors";
import express from "express";
import helmet from "helmet";

import {
  createAuthRouter,
  createSessionRouter,
  createProfileRouter,
  createBackupRouter,
  createCreatureRouter,
  createItemRouter,
  createRaceRouter,
  createUniverseRouter,
  createCharacterRouter,
  createCharacterOrganizationRouter,
  createCharacterRelationshipRouter,
  createLocationRouter,
  createOrganizationRouter,
  createWorldRuleRouter,
  createEventRouter,
  createEventCharacterRouter,
  createWritingRouter,
  createStoryRouter,
  createWorkspaceRouter,
  createDashboardRouter,
} from "./modules/index.js";
import {
  authenticate as authenticateSession,
  errorHandler,
  apiSecurityHeaders,
  createWriteRateLimiter,
} from "./shared/middlewares/index.js";

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
  app.use("/api/writing", createWritingRouter(authenticate));
  app.use("/api/stories", createStoryRouter(authenticate));
  app.use("/api/workspace", createWorkspaceRouter(authenticate));
  app.use("/api/dashboard", createDashboardRouter(authenticate));

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
