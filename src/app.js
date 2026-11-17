import cors from "cors";
import express from "express";

export function createApp(origins) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "capitulando-mobile-api" });
  });

  return app;
}
