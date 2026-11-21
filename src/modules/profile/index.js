import express, { Router } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validateBody } from "../auth/schemas/auth.js";
import { profileSchema, settingsSchema } from "./schemas/profile.js";
import {
  getProfile,
  putProfile,
  getSettings,
  putSettings,
} from "./controllers/profile.js";

export function createProfileRouter() {
  const router = Router();
  router.use(authenticate);
  router.use(express.json({ limit: "3mb" }));
  router.get("/", getProfile);
  router.put("/", validateBody(profileSchema), putProfile);
  router.get("/settings", getSettings);
  router.put("/settings", validateBody(settingsSchema), putSettings);
  return router;
}
