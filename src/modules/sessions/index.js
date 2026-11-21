import { Router } from "express";
import { authenticate, requireRole } from "../../shared/middlewares/auth.js";
import {
  listSessions,
  revokeSession,
  sessionStats,
} from "./controllers/sessions.js";
import { validateSessionId } from "./schemas/session.js";

export function createSessionRouter() {
  const router = Router();
  router.use(authenticate);
  router.get("/", listSessions);
  router.get("/stats", requireRole("ADMIN"), sessionStats);
  router.delete("/:sessionId", validateSessionId, revokeSession);
  return router;
}
