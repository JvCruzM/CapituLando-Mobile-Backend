import { transaction } from "../../../database/transaction.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { findUser } from "../../auth/repositories/auth.js";
import { createSessionRepository } from "../repositories/sessions.js";

export async function listSessions(req, res) {
  const rows = await createSessionRepository(req.app.locals.db).list(
    res.locals.principal.id,
  );
  res.set("Cache-Control", "no-store").json(rows);
}

export async function revokeSession(req, res) {
  const ownerId = res.locals.principal.id;
  await transaction(req.app.locals.db, async (client) => {
    await findUser(client, "id", ownerId, true);
    const repository = createSessionRepository(client);
    const session = await repository.lockSession(res.locals.sessionId);
    if (!session || session.user_id !== ownerId) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Sessão não encontrada.");
    }
    await repository.revokeSession(session.id);
  });
  res.status(204).end();
}

export async function sessionStats(req, res) {
  const {
    rows: [stats],
  } = await req.app.locals.db.query(
    `SELECT count(*)::int AS "activeSessions" FROM refresh_sessions AS s
     JOIN users AS u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active
       AND u.email_verified AND s.token_version = u.token_version`,
  );
  res.json(stats);
}
