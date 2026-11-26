import { Router } from "express";
import { requireValidPrincipal } from "../../shared/middlewares/security.js";
import { showDashboard } from "./controllers/dashboard.js";

export function createDashboardRouter(authenticate) {
  const router = Router();

  router.use(authenticate, requireValidPrincipal);
  router.get("/", showDashboard);

  return router;
}
