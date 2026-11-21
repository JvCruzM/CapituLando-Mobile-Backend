import { readProfile, readSettings } from "../repositories/profile.js";
import { updateProfile, updateSettings } from "../services/profile-service.js";

export async function getProfile(req, res) {
  res.json(await readProfile(req.app.locals.db, res.locals.principal.id));
}
export async function putProfile(req, res) {
  res.json(
    await updateProfile(
      req.app.locals.db,
      res.locals.principal.id,
      res.locals.input,
    ),
  );
}
export async function getSettings(req, res) {
  res.json(await readSettings(req.app.locals.db, res.locals.principal.id));
}
export async function putSettings(req, res) {
  res.json(
    await updateSettings(
      req.app.locals.db,
      res.locals.principal.id,
      res.locals.input,
    ),
  );
}
