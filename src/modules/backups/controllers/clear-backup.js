import { clearAccountContent } from "../services/clear-backup.js";

export async function clearBackup(req, res) {
  await clearAccountContent(req.app.locals.db, res.locals.principal.id);
  res.status(204).end();
}
