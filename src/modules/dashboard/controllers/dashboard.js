import { getDashboard } from "../services/dashboard-service.js";

export async function showDashboard(req, res) {
  const dashboard = await getDashboard(
    req.app.locals.db,
    res.locals.principal.id,
  );

  res.json(dashboard);
}
