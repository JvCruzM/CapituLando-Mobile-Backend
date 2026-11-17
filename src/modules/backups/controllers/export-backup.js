import { exportBackup } from "../services/export-backup.js";

export async function downloadBackup(req, res) {
  const backup = await exportBackup(req.app.locals.db, res.locals.principal.id);
  if (!backup) {
    return res.status(404).json({
      error: { code: "PROFILE_NOT_FOUND", message: "Perfil não encontrado." },
    });
  }

  res.set("Cache-Control", "no-store");
  res.attachment(`capitulando-backup-${backup.exportedAt.slice(0, 10)}.json`);
  res.json(backup);
}
