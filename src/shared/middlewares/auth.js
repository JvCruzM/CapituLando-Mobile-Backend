import { z } from "zod";
import { AppError } from "../errors/index.js";
import { verifyAccessToken } from "../utils/crypto.js";

const claimsSchema = z.object({
  sub: z.guid(),
  sid: z.guid(),
  tokenVersion: z.int().nonnegative(),
});
const denied = () =>
  new AppError(401, "UNAUTHORIZED", "Entre novamente para continuar.");

export function authenticate(req, res, next) {
  return authenticateRequest(req, res).then(() => next(), next);
}

async function authenticateRequest(req, res) {
  const match = /^Bearer ([^\s]+)$/.exec(req.get("Authorization") ?? "");
  if (!match) throw denied();
  let claims;
  try {
    claims = claimsSchema.parse(
      verifyAccessToken(match[1], req.app.locals.config),
    );
  } catch {
    throw denied();
  }
  const {
    rows: [user],
  } = await req.app.locals.db.query(
    `SELECT u.id, u.role FROM users AS u
     JOIN profiles AS p ON p.id = u.id
     JOIN refresh_sessions AS s ON s.user_id = u.id
     WHERE u.id = $1 AND s.id = $2 AND u.token_version = $3
       AND s.token_version = u.token_version AND s.revoked_at IS NULL
       AND s.expires_at > now() AND u.is_active AND u.email_verified`,
    [claims.sub, claims.sid, claims.tokenVersion],
  );
  if (!user) throw denied();
  res.locals.principal = {
    id: user.id,
    role: user.role,
    sessionId: claims.sid,
  };
}

export function requireRole(...roles) {
  return (_req, res, next) => {
    if (!res.locals.principal) throw denied();
    if (!roles.includes(res.locals.principal.role)) {
      throw new AppError(403, "FORBIDDEN", "Acesso não permitido.");
    }
    next();
  };
}
