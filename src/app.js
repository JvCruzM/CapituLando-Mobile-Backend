import cors from "cors";
import express from "express";
import { createRaceRouter } from "./modules/races/index.js";

export function createApp(origins, { authenticate } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: origins }));
  app.use("/api/stories/:storyId/races", createRaceRouter(authenticate));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "capitulando-mobile-api" });
  });

  return app;
}
