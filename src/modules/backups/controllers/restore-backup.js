import { restoreBackup } from "../services/restore-backup.js";

export async function uploadBackup(req, res) {
  await restoreBackup(req.app.locals.db, res.locals.principal.id, req.body);
  res.status(204).end();
}
