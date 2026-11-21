import { transaction } from "../../../database/transaction.js";
import { AppError } from "../../../shared/errors/app-error.js";
import {
  hashToken,
  issueAccessToken,
  opaqueToken,
} from "../../../shared/utils/crypto.js";
import { findUser, publicUser } from "../../auth/repositories/auth.js";
import { createSessionRepository } from "../repositories/sessions.js";

export const unauthorized = () =>
  new AppError(401, "UNAUTHORIZED", "Sessão inválida ou expirada.");

export function sessionResponse(user, session, refreshToken, config) {
  return {
    sessionId: session.id,
    accessToken: issueAccessToken(user, session.id, config),
    refreshToken,
    tokenType: "Bearer",
    expiresInSeconds: config.ACCESS_TOKEN_SECONDS,
    user: publicUser(user),
  };
}

export async function refreshSession(pool, config, rawToken) {
  const tokenHash = hashToken(rawToken);
  const response = await transaction(pool, async (client) => {
    const repository = createSessionRepository(client);
    const location = await repository.locate(tokenHash);
    if (!location) return null;
    // Mesma ordem de locks das demais alterações de segurança.
    const user = await findUser(client, "id", location.user_id, true);
    if (!user) return null;
    const session = await repository.lockSession(location.id);
    const token = await repository.lockToken(tokenHash);
    if (!session || !token) return null;
    if (token.consumed_at) {
      await repository.revokeSession(session.id);
      return null;
    }
    if (
      !user.is_active ||
      !user.email_verified ||
      session.revoked_at ||
      !session.unexpired ||
      session.token_version !== user.token_version ||
      token.revoked_at ||
      !token.unexpired
    ) {
      await repository.revokeSession(session.id);
      return null;
    }
    const refreshToken = opaqueToken();
    const next = await repository.addToken(session, hashToken(refreshToken));
    await repository.consume(token.id, next.id);
    return sessionResponse(user, session, refreshToken, config);
  });
  if (!response) throw unauthorized();
  return response;
}

export async function logoutSession(pool, principal, rawToken) {
  await transaction(pool, async (client) => {
    const user = await findUser(client, "id", principal.id, true);
    if (!user) throw unauthorized();
    const repository = createSessionRepository(client);
    if (rawToken) {
      const location = await repository.locate(hashToken(rawToken));
      if (
        !location ||
        location.user_id !== principal.id ||
        location.id !== principal.sessionId
      )
        throw unauthorized();
    }
    await repository.revokeSession(principal.sessionId);
  });
}
