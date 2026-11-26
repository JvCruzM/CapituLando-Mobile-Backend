import { Router } from "express";
import { showDashboard } from "./controllers/dashboard.js";

export function createDashboardRouter(authenticate) {
  const router = Router();

  router.use(authenticate);
  router.get("/", showDashboard);

  return router;
}
