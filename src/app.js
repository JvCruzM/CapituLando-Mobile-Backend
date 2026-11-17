import cors from "cors";
import express from "express";
import { createBackupRouter } from "./modules/backups/index.js";
import { createCreatureRouter } from "./modules/creatures/index.js";
import { createItemRouter } from "./modules/items/index.js";
import { createRaceRouter } from "./modules/races/index.js";

export function createApp(origins, { authenticate } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: origins }));
  app.use("/api/stories/:storyId/races", createRaceRouter(authenticate));
  app.use("/api/stories/:storyId/creatures", createCreatureRouter(authenticate));
  app.use("/api/stories/:storyId/items", createItemRouter(authenticate));
  app.use("/api/backup", createBackupRouter(authenticate));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "capitulando-mobile-api" });
  });

  return app;
}
